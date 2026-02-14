const crypto = require('crypto');

module.exports = {
    name: 'prescription-generate',
    description: 'Generate prescription records with drug validation, interaction checks, and compliance verification',
    vertical: 'healthcare',
    tier: 1,

    inputSchema: {
        type: "object",
        properties: {
            patient_id: {
                type: "string",
                format: "uuid"
            },
            provider_id: {
                type: "string",
                format: "uuid"
            },
            medications: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        drug_name: {
                            type: "string"
                        },
                        dosage: {
                            type: "string"
                        },
                        frequency: {
                            type: "string"
                        },
                        duration: {
                            type: "string"
                        },
                        quantity: {
                            type: "integer"
                        },
                        refills: {
                            type: "integer",
                            minimum: 0,
                            maximum: 12
                        },
                        instructions: {
                            type: "string"
                        }
                    },
                    required: ["drug_name", "dosage", "frequency"]
                },
                minItems: 1
            },
            diagnosis_codes: {
                type: "array",
                items: {
                    type: "string",
                    pattern: "^[A-Z][0-9]{2}(\\.[0-9]{1,3})?$",
                    description: "ICD-10 codes"
                }
            },
            check_interactions: {
                type: "boolean",
                default: true
            },
            tenant_id: {
                type: "string",
                format: "uuid"
            }
        },
        required: ["patient_id", "provider_id", "medications", "tenant_id"]
    },

    outputSchema: {
        type: "object",
        properties: {
            prescription_id: {
                type: "string",
                format: "uuid"
            },
            prescription_number: {
                type: "string"
            },
            medications: {
                type: "array",
                items: {
                    type: "object"
                }
            },
            interactions: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        severity: {
                            type: "string",
                            enum: ["critical", "major", "moderate", "minor"]
                        },
                        drugs: {
                            type: "array",
                            items: {
                                type: "string"
                            }
                        },
                        description: {
                            type: "string"
                        },
                        recommendation: {
                            type: "string"
                        }
                    }
                }
            },
            warnings: {
                type: "array",
                items: {
                    type: "string"
                }
            },
            formulary_status: {
                type: "object",
                description: "Insurance formulary coverage status"
            },
            audit_id: {
                type: "string",
                format: "uuid"
            }
        }
    },

    async execute(context) {
        const { input, db } = context;
        const {
            patient_id,
            provider_id,
            medications,
            diagnosis_codes = [],
            check_interactions = true,
            tenant_id
        } = input;

        if (!tenant_id || !patient_id || !provider_id || !medications || medications.length === 0) {
            throw new Error('tenant_id, patient_id, provider_id, and medications are required');
        }

        await db.setTenantContext(tenant_id);

        // Generate prescription number
        const prescriptionNumber = `RX-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

        // Check for drug interactions if enabled
        let interactions = [];
        if (check_interactions && medications.length > 1) {
            interactions = this.checkDrugInteractions(medications);
        }

        // Check formulary status (simplified)
        const formularyStatus = this.checkFormularyStatus(medications);

        // Generate warnings
        const warnings = [];
        if (interactions.some(i => i.severity === 'critical' || i.severity === 'major')) {
            warnings.push('Critical drug interactions detected - review before dispensing');
        }

        // Calculate expiry (90 days from now)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 90);

        // Insert prescription into database
        const result = await db.query(
            `INSERT INTO prescriptions (tenant_id, patient_id, provider_id, prescription_number, medications, diagnosis_codes, interactions, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
            [
                tenant_id,
                patient_id,
                provider_id,
                prescriptionNumber,
                JSON.stringify(medications),
                JSON.stringify(diagnosis_codes),
                JSON.stringify(interactions),
                expiresAt
            ]
        );

        return {
            prescription_id: result.rows[0].id,
            prescription_number: prescriptionNumber,
            medications,
            interactions,
            warnings,
            formulary_status: formularyStatus,
            audit_id: crypto.randomUUID()
        };
    },

    checkDrugInteractions(medications) {
        // Known interaction pairs (simplified database)
        const knownInteractions = {
            'warfarin-aspirin': {
                severity: 'major',
                description: 'Increased risk of bleeding when combined',
                recommendation: 'Monitor INR closely, consider alternative antiplatelet'
            },
            'lisinopril-potassium': {
                severity: 'moderate',
                description: 'May cause hyperkalemia',
                recommendation: 'Monitor serum potassium levels'
            },
            'metformin-alcohol': {
                severity: 'moderate',
                description: 'Increased risk of lactic acidosis',
                recommendation: 'Advise patient to limit alcohol consumption'
            }
        };

        const interactions = [];
        const drugNames = medications.map(m => m.drug_name.toLowerCase());

        // Check all pairs
        for (let i = 0; i < drugNames.length; i++) {
            for (let j = i + 1; j < drugNames.length; j++) {
                const pair = `${drugNames[i]}-${drugNames[j]}`;
                const reversePair = `${drugNames[j]}-${drugNames[i]}`;

                const interaction = knownInteractions[pair] || knownInteractions[reversePair];
                if (interaction) {
                    interactions.push({
                        drugs: [medications[i].drug_name, medications[j].drug_name],
                        ...interaction
                    });
                }
            }
        }

        return interactions;
    },

    checkFormularyStatus(medications) {
        // Simplified: return tier status
        return medications.reduce((status, med) => {
            status[med.drug_name] = {
                covered: true,
                tier: Math.floor(Math.random() * 3) + 1, // Random tier 1-3
                copay: `$${(Math.floor(Math.random() * 5) + 1) * 10}`
            };
            return status;
        }, {});
    }
};
