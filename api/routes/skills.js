const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const db = require('../../core/database/connection');
const EncryptionService = require('../../security/encryption/service');
const DLPScanner = require('../../security/dlp/scanner');
const AuditLogger = require('../../security/audit/logger');

// Initialize services
const encryption = new EncryptionService(process.env.MASTER_ENCRYPTION_KEY);
const dlp = new DLPScanner({ strictMode: true });
const audit = new AuditLogger({ connectionString: process.env.DATABASE_URL });

// Load skills dynamically
const skills = {
  'phi-redact': require('../../verticals/healthcare/skills/phi-redact'),
  'phi-validate': require('../../verticals/healthcare/skills/phi-validate'),
  'patient-intake': require('../../verticals/healthcare/skills/patient-intake'),
  'appointment-schedule': require('../../verticals/healthcare/skills/appointment-schedule'),
  'prescription-generate': require('../../verticals/healthcare/skills/prescription-generate')
};

// List all available skills
router.get('/', (req, res) => {
  const availableSkills = Object.keys(skills).map(name => ({
    name,
    description: skills[name].description,
    vertical: skills[name].vertical,
    tier: skills[name].tier
  }));

  res.json({
    tenant: req.tenant.id,
    vertical: req.tenant.vertical,
    skills: availableSkills.filter(s => s.vertical === req.tenant.vertical)
  });
});

// Execute a skill
router.post('/:skillName', async (req, res) => {
  const { skillName } = req.params;
  const startTime = Date.now();

  try {
    // Check if skill exists
    const skill = skills[skillName];
    if (!skill) {
      return res.status(404).json({
        error: 'SKILL_NOT_FOUND',
        message: `Skill '${skillName}' not found`,
        availableSkills: Object.keys(skills)
      });
    }

    // Check if skill is available for this vertical
    if (skill.vertical !== req.tenant.vertical) {
      return res.status(403).json({
        error: 'SKILL_NOT_AVAILABLE',
        message: `Skill '${skillName}' is not available for ${req.tenant.vertical} vertical`
      });
    }

    // Hash input for audit
    const inputHash = crypto.createHash('sha256')
      .update(JSON.stringify(req.body))
      .digest('hex');

    // DLP scan input
    const dlpScan = dlp.scan(JSON.stringify(req.body), {
      context: req.tenant.vertical,
      includeMatches: false
    });

    const blockers = dlpScan.findings.filter(f => f.action === 'BLOCK');
    if (blockers.length > 0 && req.tenant.dlpStrictMode) {
      await audit.log({
        tenantId: req.tenant.id,
        action: 'SKILL_EXECUTION_BLOCKED',
        skillName,
        requestBodyHash: inputHash,
        dlpFindings: blockers,
        responseStatus: 403
      });

      return res.status(403).json({
        error: 'DLP_VIOLATION',
        message: 'Request contains sensitive data that cannot be processed',
        violations: blockers.map(b => ({
          type: b.type,
          severity: b.severity,
          description: b.description
        }))
      });
    }

    // Execute skill
    const context = {
      tenant: req.tenant,
      encryption,
      dlp,
      audit,
      db,
      input: req.body
    };

    const result = await skill.execute(context);
    const durationMs = Date.now() - startTime;

    // Hash output for audit
    const outputHash = crypto.createHash('sha256')
      .update(JSON.stringify(result))
      .digest('hex');

    // Log success
    await audit.log({
      tenantId: req.tenant.id,
      action: 'SKILL_EXECUTION_SUCCESS',
      skillName,
      requestBodyHash: inputHash,
      responseBodyHash: outputHash,
      responseStatus: 200,
      durationMs,
      dlpFindings: dlpScan.findings
    });

    res.json({
      success: true,
      skill: skillName,
      result,
      metadata: {
        executionTime: durationMs,
        dlpScan: {
          scanned: true,
          findings: dlpScan.findings.length,
          sensitive: dlpScan.hasSensitiveData
        }
      }
    });

  } catch (error) {
    const durationMs = Date.now() - startTime;

    await audit.log({
      tenantId: req.tenant.id,
      action: 'SKILL_EXECUTION_ERROR',
      skillName,
      responseStatus: 500,
      durationMs,
      errorMessage: error.message,
      errorStack: error.stack
    });

    res.status(500).json({
      error: 'SKILL_EXECUTION_ERROR',
      message: error.message,
      skill: skillName
    });
  }
});

module.exports = router;
