module.exports = {
  name: 'phi-validate',
  description: 'Validate that text or data meets HIPAA PHI handling requirements',
  vertical: 'healthcare',
  tier: 1,

  async execute(context) {
    const { input, dlp } = context;
    const { content, validation_rules = ['no_phi', 'minimum_necessary', 'audit_trail'], context: validationContext, tenant_id } = input;

    if (!content || !tenant_id) {
      throw new Error('content and tenant_id are required');
    }

    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);

    // Run DLP scan
    const scanResult = dlp.validate(contentStr, {
      context: 'healthcare',
      allowedCategories: []
    });

    const violations = [];
    const recommendations = [];

    // Check validation rules
    if (validation_rules.includes('no_phi') && scanResult.blockers.length > 0) {
      violations.push({
        rule: 'no_phi',
        severity: 'critical',
        description: 'Content contains PHI that should not be present',
        location: 'body'
      });
      recommendations.push('Remove or redact all PHI before proceeding');
    }

    if (validation_rules.includes('minimum_necessary')) {
      // Check if excessive data is requested
      const dataPoints = contentStr.split(/[,.\s]+/).length;
      if (dataPoints > 100 && validationContext?.purpose === 'operations') {
        violations.push({
          rule: 'minimum_necessary',
          severity: 'high',
          description: 'Excessive data requested for stated purpose',
          location: 'entire_request'
        });
        recommendations.push('Limit data request to minimum necessary for stated purpose');
      }
    }

    if (validation_rules.includes('audit_trail')) {
      if (!validationContext?.user_role) {
        violations.push({
          rule: 'audit_trail',
          severity: 'medium',
          description: 'Missing user context for audit trail',
          location: 'context'
        });
        recommendations.push('Include user_role and purpose in request context');
      }
    }

    return {
      is_valid: violations.length === 0,
      violations,
      recommendations,
      audit_id: crypto.randomUUID()
    };
  }
};

const crypto = require('crypto');
