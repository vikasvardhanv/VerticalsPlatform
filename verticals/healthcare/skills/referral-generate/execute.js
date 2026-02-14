const crypto = require('crypto');

module.exports = {
    name: 'referral-generate',
    description: 'Create clinical referral records for specialists',
    vertical: 'healthcare',
    tier: 2,

    inputSchema: {
        type: "object",
        properties: {
            patient_id: { type: "string", format: "uuid" },
            referring_provider_id: { type: "string", format: "uuid" },
            specialist_type: { type: "string" },
            reason_for_referral: { type: "string" },
            urgency: { type: "string", enum: ["routine", "urgent", "emergent"], default: "routine" },
            tenant_id: { type: "string", format: "uuid" }
        },
        required: ["patient_id", "specialist_type", "reason_for_referral", "tenant_id"]
    },

    outputSchema: {
        type: "object",
        properties: {
            referral_id: { type: "string", format: "uuid" },
            referral_number: { type: "string" },
            status: { type: "string" },
            expiration_date: { type: "string", format: "date-time" },
            audit_id: { type: "string", format: "uuid" }
        }
    },

    async execute(context) {
        const { input } = context;
        const { patient_id, specialist_type, reason_for_referral, tenant_id } = input;

        if (!patient_id || !specialist_type || !reason_for_referral || !tenant_id) {
            throw new Error('patient_id, specialist_type, reason_for_referral, and tenant_id are required');
        }

        const referralNumber = `REF-${Math.random().toString(36).substr(2, 6).toUpperCase()}-${Date.now().toString().slice(-4)}`;

        return {
            referral_id: crypto.randomUUID(),
            referral_number: referralNumber,
            status: "pending_authorization",
            expiration_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
            audit_id: crypto.randomUUID()
        };
    }
};
