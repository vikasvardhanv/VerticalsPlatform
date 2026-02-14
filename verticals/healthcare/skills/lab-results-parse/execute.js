const crypto = require('crypto');

module.exports = {
    name: 'lab-results-parse',
    description: 'Parse and structure lab results from unstructured reports or data feeds',
    vertical: 'healthcare',
    tier: 2,

    inputSchema: {
        type: "object",
        properties: {
            report_text: {
                type: "string",
                description: "Raw text of the lab report"
            },
            report_type: {
                type: "string",
                enum: ["blood_panel", "urinalysis", "radiology", "pathology", "other"],
                default: "blood_panel"
            },
            tenant_id: {
                type: "string",
                format: "uuid"
            }
        },
        required: ["report_text", "tenant_id"]
    },

    outputSchema: {
        type: "object",
        properties: {
            results: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        test_name: { type: "string" },
                        value: { type: "string" },
                        unit: { type: "string" },
                        reference_range: { type: "string" },
                        interpretation: { type: "string", enum: ["normal", "abnormal", "critical", "low", "high"] }
                    }
                }
            },
            patient_id: { type: "string" },
            collection_date: { type: "string", format: "date-time" },
            summary: { type: "string" },
            audit_id: { type: "string", format: "uuid" }
        }
    },

    async execute(context) {
        const { input, dlp } = context;
        const { report_text, tenant_id } = input;

        if (!report_text || !tenant_id) {
            throw new Error('report_text and tenant_id are required');
        }

        // 1. DLP Scan for security
        const dlpScan = dlp.scan(report_text, { context: 'healthcare' });

        // 2. Mock parsing logic
        // In production, this would use a specialized medical parser or LLM
        const results = [
            { test_name: "Glucose", value: "110", unit: "mg/dL", reference_range: "70-99", interpretation: "high" },
            { test_name: "Hemoglobin A1c", value: "5.8", unit: "%", reference_range: "<5.7", interpretation: "high" },
            { test_name: "Creatinine", value: "0.9", unit: "mg/dL", reference_range: "0.7-1.3", interpretation: "normal" }
        ];

        return {
            results,
            patient_id: "EXTRACTED-998877",
            collection_date: new Date().toISOString(),
            summary: "Results indicate slightly elevated blood glucose and A1c levels.",
            audit_id: crypto.randomUUID()
        };
    }
};
