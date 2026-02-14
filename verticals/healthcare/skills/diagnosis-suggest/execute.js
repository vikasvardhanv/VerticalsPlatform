const crypto = require('crypto');

module.exports = {
    name: 'diagnosis-suggest',
    description: 'Suggest potential differential diagnoses based on symptoms, history, and lab results',
    vertical: 'healthcare',
    tier: 3,

    inputSchema: {
        type: "object",
        properties: {
            symptoms: { type: "array", items: { type: "string" } },
            patient_history: { type: "string" },
            lab_results: { type: "array", items: { type: "object" } },
            tenant_id: { type: "string", format: "uuid" }
        },
        required: ["symptoms", "tenant_id"]
    },

    outputSchema: {
        type: "object",
        properties: {
            suggestions: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        diagnosis: { type: "string" },
                        confidence: { type: "number" },
                        reasoning: { type: "string" },
                        icd10_link: { type: "string" }
                    }
                }
            },
            audit_id: { type: "string", format: "uuid" }
        }
    },

    async execute(context) {
        const { input } = context;
        const { symptoms, tenant_id } = input;

        if (!symptoms || symptoms.length === 0 || !tenant_id) {
            throw new Error('symptoms and tenant_id are required');
        }

        // Mock clinical reasoning
        const suggestions = [
            {
                diagnosis: "Type 2 Diabetes Mellitus",
                confidence: 0.82,
                reasoning: "Based on persistent polyuria, polydipsia, and elevated HbA1c in history.",
                icd10_link: "E11.9"
            }
        ];

        if (symptoms.includes('chest pain')) {
            suggestions.unshift({
                diagnosis: "Acute Coronary Syndrome",
                confidence: 0.65,
                reasoning: "Symptom profile and risk factors require exclusion of ACS via ECG and Troponin.",
                icd10_link: "I24.9"
            });
        }

        return {
            suggestions,
            audit_id: crypto.randomUUID()
        };
    }
};
