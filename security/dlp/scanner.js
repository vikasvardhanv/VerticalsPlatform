/**
 * Data Loss Prevention (DLP) Scanner
 * Detects and redacts sensitive information (PHI, PII, PCI, etc.)
 */

// Detection patterns for various sensitive data types
const PATTERNS = {
  // Healthcare (HIPAA)
  ssn: {
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    description: 'Social Security Number',
    severity: 'CRITICAL',
    categories: ['PHI', 'PII']
  },
  mrn: {
    regex: /\b(MRN|Medical Record Number|Medical Record|Patient ID)[\s:#-]*([A-Z0-9]{6,12})\b/gi,
    description: 'Medical Record Number',
    severity: 'CRITICAL',
    categories: ['PHI']
  },
  dob: {
    regex: /\b(DOB|Date of Birth|Birth Date)[\s:]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/gi,
    description: 'Date of Birth',
    severity: 'HIGH',
    categories: ['PHI', 'PII']
  },
  npi: {
    regex: /\b(NPI)[\s:#-]*(\d{10})\b/gi,
    description: 'National Provider Identifier',
    severity: 'MEDIUM',
    categories: ['PHI']
  },

  // Finance (PCI-DSS, SOX)
  creditCard: {
    regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    description: 'Credit Card Number',
    severity: 'CRITICAL',
    categories: ['PCI', 'PII']
  },
  accountNumber: {
    regex: /\b(Account|Acct|Account Number)[\s:#-]*([\d-]{8,17})\b/gi,
    description: 'Bank Account Number',
    severity: 'CRITICAL',
    categories: ['PII', 'FINANCIAL']
  },
  routing: {
    regex: /\b(Routing|ABA|Routing Number)[\s:#-]*(\d{9})\b/gi,
    description: 'Bank Routing Number',
    severity: 'HIGH',
    categories: ['FINANCIAL']
  },
  ein: {
    regex: /\b\d{2}-\d{7}\b/g,
    description: 'Employer Identification Number',
    severity: 'HIGH',
    categories: ['FINANCIAL', 'PII']
  },

  // General PII
  email: {
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    description: 'Email Address',
    severity: 'MEDIUM',
    categories: ['PII']
  },
  phone: {
    regex: /\b(\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    description: 'Phone Number',
    severity: 'MEDIUM',
    categories: ['PII']
  },
  ipAddress: {
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    description: 'IP Address',
    severity: 'LOW',
    categories: ['PII', 'TECHNICAL']
  },

  // Technical/Security
  apiKey: {
    regex: /\b(api[_-]?key|apikey|access[_-]?token)[\s:=]+['"]?([a-zA-Z0-9_\-]{20,})['"]?/gi,
    description: 'API Key or Access Token',
    severity: 'CRITICAL',
    categories: ['SECURITY']
  },
  awsKey: {
    regex: /\b(AKIA[0-9A-Z]{16})\b/g,
    description: 'AWS Access Key',
    severity: 'CRITICAL',
    categories: ['SECURITY']
  },
  privateKey: {
    regex: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    description: 'Private Key',
    severity: 'CRITICAL',
    categories: ['SECURITY']
  }
};

class DLPScanner {
  constructor(config = {}) {
    this.patterns = PATTERNS;
    this.strictMode = config.strictMode || false;
    this.customPatterns = config.customPatterns || {};

    // Merge custom patterns
    this.patterns = { ...this.patterns, ...this.customPatterns };
  }

  /**
   * Scan text for sensitive information
   * @param {string} text - Text to scan
   * @param {object} options - Scan options
   * @returns {object} Scan results
   */
  scan(text, options = {}) {
    if (typeof text !== 'string') {
      return { findings: [], hasSensitiveData: false };
    }

    const {
      context = 'default',
      categories = null, // null = scan all categories
      includeMatches = false // whether to include actual matched text
    } = options;

    const findings = [];
    let totalMatches = 0;

    for (const [type, pattern] of Object.entries(this.patterns)) {
      // Skip if category filter is set and pattern doesn't match
      if (categories && !pattern.categories.some(cat => categories.includes(cat))) {
        continue;
      }

      const matches = text.match(pattern.regex);

      if (matches && matches.length > 0) {
        totalMatches += matches.length;

        const finding = {
          type,
          description: pattern.description,
          count: matches.length,
          severity: this.getSeverity(type, context, pattern.severity),
          action: this.getAction(type, context, pattern.severity),
          categories: pattern.categories
        };

        if (includeMatches) {
          finding.matches = matches;
        }

        findings.push(finding);
      }
    }

    return {
      findings,
      hasSensitiveData: totalMatches > 0,
      totalMatches,
      scannedAt: new Date().toISOString()
    };
  }

  /**
   * Determine severity based on context
   * @param {string} type - Pattern type
   * @param {string} context - Scan context (healthcare, finance, etc.)
   * @param {string} defaultSeverity - Default severity from pattern
   * @returns {string} Severity level
   */
  getSeverity(type, context, defaultSeverity) {
    // Context-specific severity adjustments
    const contextRules = {
      healthcare: {
        promoteToCritical: ['mrn', 'dob', 'ssn', 'npi'],
        promoteToHigh: ['email', 'phone']
      },
      finance: {
        promoteToCritical: ['creditCard', 'accountNumber', 'routing', 'ein'],
        promoteToHigh: ['email', 'phone']
      },
      legal: {
        promoteToCritical: ['ssn', 'creditCard'],
        promoteToHigh: ['email', 'phone', 'dob']
      }
    };

    if (contextRules[context]) {
      if (contextRules[context].promoteToCritical?.includes(type)) {
        return 'CRITICAL';
      }
      if (contextRules[context].promoteToHigh?.includes(type)) {
        return 'HIGH';
      }
    }

    return defaultSeverity;
  }

  /**
   * Determine action based on severity and context
   * @param {string} type - Pattern type
   * @param {string} context - Scan context
   * @param {string} severity - Severity level
   * @returns {string} Action to take (BLOCK, REDACT, WARN)
   */
  getAction(type, context, severity) {
    // In strict mode, block all CRITICAL findings
    if (this.strictMode && severity === 'CRITICAL') {
      return 'BLOCK';
    }

    // Context-specific actions
    if (context === 'healthcare' && ['mrn', 'ssn', 'npi'].includes(type)) {
      return 'BLOCK';
    }

    if (context === 'finance' && ['creditCard', 'accountNumber', 'apiKey'].includes(type)) {
      return 'BLOCK';
    }

    // Default actions by severity
    const actionMap = {
      CRITICAL: 'BLOCK',
      HIGH: 'REDACT',
      MEDIUM: 'REDACT',
      LOW: 'WARN'
    };

    return actionMap[severity] || 'WARN';
  }

  /**
   * Redact sensitive information from text
   * @param {string} text - Text to redact
   * @param {object} options - Redaction options
   * @returns {object} Redacted text and metadata
   */
  redact(text, options = {}) {
    if (typeof text !== 'string') {
      return { redactedText: text, redactions: [] };
    }

    const {
      context = 'default',
      redactionStyle = 'mask', // mask, remove, hash, tokenize
      preserveFormat = false // preserve string length/format
    } = options;

    let redactedText = text;
    const redactions = [];

    for (const [type, pattern] of Object.entries(this.patterns)) {
      const severity = this.getSeverity(type, context, pattern.severity);
      const action = this.getAction(type, context, severity);

      if (action === 'REDACT' || action === 'BLOCK') {
        const matches = text.match(pattern.regex);

        if (matches) {
          matches.forEach(match => {
            const replacement = this.getRedactionReplacement(
              type,
              match,
              redactionStyle,
              preserveFormat
            );

            redactedText = redactedText.replace(match, replacement);

            redactions.push({
              type,
              original: includeMatches ? match : '[HIDDEN]',
              replacement,
              action
            });
          });
        }
      }
    }

    return {
      redactedText,
      redactions,
      redactedAt: new Date().toISOString()
    };
  }

  /**
   * Generate redaction replacement text
   * @param {string} type - Pattern type
   * @param {string} original - Original matched text
   * @param {string} style - Redaction style
   * @param {boolean} preserveFormat - Whether to preserve format
   * @returns {string} Replacement text
   */
  getRedactionReplacement(type, original, style, preserveFormat) {
    switch (style) {
      case 'mask':
        if (preserveFormat) {
          return original.replace(/[a-zA-Z0-9]/g, '*');
        }
        return `[${type.toUpperCase()}_REDACTED]`;

      case 'remove':
        return '';

      case 'hash':
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256').update(original).digest('hex').substring(0, 8);
        return `[${type.toUpperCase()}_${hash}]`;

      case 'tokenize':
        return `[${type.toUpperCase()}_TOKEN_${Math.random().toString(36).substring(2, 10).toUpperCase()}]`;

      default:
        return `[${type.toUpperCase()}_REDACTED]`;
    }
  }

  /**
   * Validate that text is safe for external transmission
   * @param {string} text - Text to validate
   * @param {object} options - Validation options
   * @returns {object} Validation result
   */
  validate(text, options = {}) {
    const { context = 'default', allowedCategories = [] } = options;
    const scanResults = this.scan(text, { context, includeMatches: false });

    const blockers = scanResults.findings.filter(f => f.action === 'BLOCK');
    const warnings = scanResults.findings.filter(f => f.action === 'WARN' || f.action === 'REDACT');

    return {
      isValid: blockers.length === 0,
      blockers,
      warnings,
      recommendation: blockers.length > 0
        ? 'BLOCK_TRANSMISSION'
        : warnings.length > 0
          ? 'REDACT_BEFORE_TRANSMISSION'
          : 'SAFE',
      scanResults
    };
  }
}

module.exports = DLPScanner;
