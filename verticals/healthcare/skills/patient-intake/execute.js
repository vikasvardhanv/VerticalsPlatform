const crypto = require('crypto');

module.exports = {
    name: 'patient-intake',
    description: 'Process patient intake forms and extract structured data',
    vertical: 'healthcare',
    tier: 1,

    inputSchema: {
        type: "object",
        properties: {
            form_data: {
                type: "object",
                description: "Raw form data (can be key-value pairs or free text)"
            },
            form_type: {
                type: "string",
                enum: ["new_patient", "follow_up", "annual_physical", "urgent_care", "telehealth"],
                default: "new_patient"
            },
            auto_redact: {
                type: "boolean",
                default: true,
                description: "Automatically redact PHI in free-text fields"
            },
            tenant_id: {
                type: "string",
                format: "uuid"
            }
        },
        required: ["form_data", "tenant_id"]
    },

    outputSchema: {
        type: "object",
        properties: {
            patient_record: {
                type: "object",
                properties: {
                    demographics: {
                        type: "object"
                    },
                    chief_complaint: {
                        type: "string"
                    },
                    medical_history: {
                        type: "array",
                        items: {
                            type: "string"
                        }
                    },
                    medications: {
                        type: "array",
                        items: {
                            type: "string"
                        }
                    },
                    allergies: {
                        type: "array",
                        items: {
                            type: "string"
                        }
                    },
                    insurance_info: {
                        type: "object"
                    }
                }
            },
            completeness_score: {
                type: "number",
                minimum: 0,
                maximum: 100
            },
            missing_fields: {
                type: "array",
                items: {
                    type: "string"
                }
            },
            validation_errors: {
                type: "array",
                items: {
                    type: "object"
                }
            },
            audit_id: {
                type: "string",
                format: "uuid"
            }
        }
    },

    async execute(context) {
        const { input, db, encryption, dlp } = context;
        const { form_data, form_type = 'new_patient', auto_redact = true, tenant_id } = input;

        if (!form_data || !tenant_id) {
            throw new Error('form_data and tenant_id are required');
        }

        // Extract and structure patient data
        const patientRecord = {
            demographics: this.extractDemographics(form_data),
            chief_complaint: form_data.chief_complaint || form_data.reason_for_visit || '',
            medical_history: this.extractMedicalHistory(form_data),
            medications: this.extractMedications(form_data),
            allergies: this.extractAllergies(form_data),
            insurance_info: this.extractInsurance(form_data)
        };

        // Auto-redact if enabled
        if (auto_redact) {
            const recordStr = JSON.stringify(patientRecord);
            const dlpScan = dlp.scan(recordStr, { context: 'healthcare' });

            if (dlpScan.hasSensitiveData) {
                // Encrypt sensitive fields
                patientRecord.demographics = encryption.encryptObject(patientRecord.demographics);
                if (patientRecord.insurance_info) {
                    patientRecord.insurance_info = encryption.encryptObject(patientRecord.insurance_info);
                }
            }
        }

        // Calculate completeness score
        const requiredFields = ['demographics', 'chief_complaint'];
        const optionalFields = ['medical_history', 'medications', 'allergies', 'insurance_info'];

        let completenessScore = 0;
        const missingFields = [];

        requiredFields.forEach(field => {
            if (patientRecord[field] && Object.keys(patientRecord[field]).length > 0) {
                completenessScore += 50 / requiredFields.length;
            } else {
                missingFields.push(field);
            }
        });

        optionalFields.forEach(field => {
            if (patientRecord[field] && Object.keys(patientRecord[field]).length > 0) {
                completenessScore += 50 / optionalFields.length;
            }
        });

        return {
            patient_record: patientRecord,
            completeness_score: Math.round(completenessScore),
            missing_fields: missingFields,
            validation_errors: [],
            audit_id: crypto.randomUUID()
        };
    },

    extractDemographics(data) {
        return {
            name: data.name || data.patient_name,
            dob: data.dob || data.date_of_birth,
            gender: data.gender,
            phone: data.phone || data.contact_phone,
            email: data.email,
            address: data.address
        };
    },

    extractMedicalHistory(data) {
        if (Array.isArray(data.medical_history)) return data.medical_history;
        if (typeof data.medical_history === 'string') {
            return data.medical_history.split(',').map(h => h.trim());
        }
        return [];
    },

    extractMedications(data) {
        if (Array.isArray(data.medications)) return data.medications;
        if (typeof data.medications === 'string') {
            return data.medications.split(',').map(m => m.trim());
        }
        return [];
    },

    extractAllergies(data) {
        if (Array.isArray(data.allergies)) return data.allergies;
        if (typeof data.allergies === 'string') {
            return data.allergies.split(',').map(a => a.trim());
        }
        return [];
    },

    extractInsurance(data) {
        return {
            provider: data.insurance_provider,
            policy_number: data.policy_number,
            group_number: data.group_number
        };
    }
};
