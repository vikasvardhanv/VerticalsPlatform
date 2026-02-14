const crypto = require('crypto');

module.exports = {
    name: 'drug-interaction-check',
    description: 'Analyze multiple medications for potential adverse drug-drug interactions',
    vertical: 'healthcare',
    tier: 3,

    inputSchema: {
        type: "object",
        properties: {
            medications: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        drug_name: { type: "string" },
                        dosage: { type: "string" }
                    },
                    required: ["drug_name"]
                },
                minItems: 2
            },
            patient_id: { type: "string", format: "uuid" },
            tenant_id: { type: "string", format: "uuid" }
        },
        required: ["medications", "tenant_id"]
    },

    outputSchema: {
        type: "object",
        properties: {
            interactions: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        severity: { type: "string", enum: ["critical", "major", "moderate", "minor"] },
                        drugs: { type: "array", items: { type: "string" } },
                        description: { type: "string" },
                        recommendation: { type: "string" }
                    }
                }
            },
            risk_score: { type: "number" },
            audit_id: { type: "string", format: "uuid" }
        }
    },

    async execute(context) {
        const { input } = context;
        const { medications, tenant_id } = input;

        if (!medications || medications.length < 2 || !tenant_id) {
            throw new Error('medications (min 2) and tenant_id are required');
        }

        // Mock interaction logic
        const drugNames = medications.map(m => m.drug_name.toLowerCase());
        const interactions = [];

        if (drugNames.includes('warfarin') && drugNames.includes('aspirin')) {
            interactions.push({
                severity: 'major',
                drugs: ['Warfarin', 'Aspirin'],
                description: 'Combined use increases risk of major bleeding.',
                recommendation: 'Close monitoring of PT/INR requested.'
            });
        }

        return {
            interactions,
            risk_score: interactions.length > 0 ? 75 : 10,
            audit_id: crypto.randomUUID()
        };
    }
};
