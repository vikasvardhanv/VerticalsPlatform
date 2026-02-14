const crypto = require('crypto');

module.exports = {
    name: 'phi-redact',
    description: 'Detect and redact Protected Health Information (PHI) from text',
    vertical: 'healthcare',
    tier: 1,

    inputSchema: {
        type: "object",
        properties: {
            text: {
                type: "string",
                description: "Raw text potentially containing PHI"
            },
            redaction_strategy: {
                type: "string",
                enum: ["mask", "remove", "hash", "tokenize"],
                default: "mask",
                description: "How to redact detected PHI"
            },
            phi_types: {
                type: "array",
                items: {
                    type: "string",
                    enum: ["name", "ssn", "mrn", "dob", "address", "phone", "email", "ip", "device_id", "biometric", "photo", "account", "license", "vehicle", "url", "date"]
                },
                default: ["name", "ssn", "mrn", "dob", "address", "phone", "email"]
            },
            tenant_id: {
                type: "string",
                format: "uuid"
            }
        },
        required: ["text", "tenant_id"]
    },

    outputSchema: {
        type: "object",
        properties: {
            redacted_text: {
                type: "string"
            },
            phi_detected: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        type: {
                            type: "string"
                        },
                        original: {
                            type: "string"
                        },
                        redacted: {
                            type: "string"
                        },
                        start: {
                            type: "integer"
                        },
                        end: {
                            type: "integer"
                        },
                        confidence: {
                            type: "number"
                        }
                    }
                }
            },
            audit_id: {
                type: "string",
                format: "uuid"
            }
        }
    },

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
