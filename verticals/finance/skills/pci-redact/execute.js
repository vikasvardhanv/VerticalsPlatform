const crypto = require('crypto');

module.exports = {
  name: 'pci-redact',
  description: 'Detect and redact PCI/PII data from financial documents',
  vertical: 'finance',
  tier: 1,

  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text containing potential PCI/PII data' },
      redaction_strategy: { type: 'string', enum: ['mask', 'remove', 'hash', 'tokenize'], default: 'mask' },
      data_types: { type: 'array', items: { type: 'string' }, default: ['credit_card', 'cvv', 'bank_account', 'routing_number'] },
      tenant_id: { type: 'string' }
    },
    required: ['text', 'tenant_id']
  },

  async execute(context) {
    const { input, audit } = context;
    const { text, redaction_strategy = 'mask', data_types = ['credit_card', 'cvv', 'bank_account', 'routing_number'], tenant_id } = input;

    const patterns = {
      credit_card: {
        regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
        label: 'CREDIT_CARD'
      },
      cvv: {
        regex: /\b(?:CVV|CVC|CCV)[:\s]*(\d{3,4})\b/gi,
        label: 'CVV'
      },
      bank_account: {
        regex: /\b(?:account|acct)[:\s#]*(\d{8,17})\b/gi,
        label: 'BANK_ACCOUNT'
      },
      routing_number: {
        regex: /\b(?:routing|aba)[:\s#]*(\d{9})\b/gi,
        label: 'ROUTING'
      },
      ssn: {
        regex: /\b\d{3}-\d{2}-\d{4}\b/g,
        label: 'SSN'
      },
      ein: {
        regex: /\b\d{2}-\d{7}\b/g,
        label: 'EIN'
      },
      email: {
        regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        label: 'EMAIL'
      },
      phone: {
        regex: /\b(?:\+1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
        label: 'PHONE'
      }
    };

    let redactedText = text;
    const findings = [];
    const tokenMap = new Map();

    for (const dataType of data_types) {
      const pattern = patterns[dataType];
      if (!pattern) continue;

      const matches = text.match(pattern.regex) || [];
      for (const match of matches) {
        const replacement = getRedaction(match, pattern.label, redaction_strategy, tokenMap);
        redactedText = redactedText.replace(match, replacement);
        findings.push({
          type: dataType,
          label: pattern.label,
          original_length: match.length,
          redacted_to: replacement,
          position: text.indexOf(match)
        });
      }
    }

    await audit?.log({
      tenantId: tenant_id,
      action: 'PCI_REDACTION',
      resourceType: 'text',
      skillName: 'pci-redact',
      meta: {
        findings_count: findings.length,
        data_types_scanned: data_types,
        strategy: redaction_strategy
      }
    });

    return {
      success: true,
      redaction_id: crypto.randomUUID(),
      original_length: text.length,
      redacted_length: redactedText.length,
      redacted_text: redactedText,
      findings,
      summary: {
        total_redactions: findings.length,
        by_type: findings.reduce((acc, f) => {
          acc[f.type] = (acc[f.type] || 0) + 1;
          return acc;
        }, {})
      },
      token_map: redaction_strategy === 'tokenize' ? Object.fromEntries(tokenMap) : null
    };
  }
};

function getRedaction(value, label, strategy, tokenMap) {
  switch (strategy) {
    case 'mask':
      if (value.length <= 4) return '*'.repeat(value.length);
      return value.slice(0, 2) + '*'.repeat(value.length - 4) + value.slice(-2);
    case 'remove':
      return `[${label}_REMOVED]`;
    case 'hash':
      return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
    case 'tokenize':
      const token = `TOK_${crypto.randomBytes(8).toString('hex')}`;
      tokenMap.set(token, value);
      return token;
    default:
      return `[${label}_REDACTED]`;
  }
}
