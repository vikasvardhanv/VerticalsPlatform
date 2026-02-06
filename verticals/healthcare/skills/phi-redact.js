module.exports = {
  name: 'phi-redact',
  description: 'Detect and redact Protected Health Information (PHI) from text',
  vertical: 'healthcare',
  tier: 1,

  async execute(context) {
    const { input, dlp } = context;
    const { text, redaction_strategy = 'mask', phi_types, tenant_id } = input;

    if (!text || !tenant_id) {
      throw new Error('text and tenant_id are required');
    }

    // Perform DLP scan
    const scanResult = dlp.scan(text, {
      context: 'healthcare',
      categories: ['PHI', 'PII'],
      includeMatches: true
    });

    // Redact the text
    const redactionResult = dlp.redact(text, {
      context: 'healthcare',
      redactionStyle: redaction_strategy,
      preserveFormat: redaction_strategy === 'mask'
    });

    // Map findings to PHI detected format
    const phiDetected = scanResult.findings.map(finding => ({
      type: finding.type,
      count: finding.count,
      severity: finding.severity,
      confidence: 0.95 // Regex-based = high confidence
    }));

    return {
      redacted_text: redactionResult.redactedText,
      phi_detected: phiDetected,
      audit_id: crypto.randomUUID()
    };
  }
};

const crypto = require('crypto');
