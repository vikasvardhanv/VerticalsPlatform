const crypto = require('crypto');

module.exports = {
    name: 'appointment-schedule',
    description: 'Schedule, reschedule, or cancel appointments with conflict detection and availability optimization',
    vertical: 'healthcare',
    tier: 1,

    inputSchema: {
        type: "object",
        properties: {
            action: {
                type: "string",
                enum: ["create", "update", "cancel", "find_available"],
                default: "create"
            },
            appointment_id: {
                type: "string",
                format: "uuid",
                description: "Required for update/cancel"
            },
            patient_id: {
                type: "string",
                format: "uuid"
            },
            provider_id: {
                type: "string",
                format: "uuid"
            },
            appointment_type: {
                type: "string",
                enum: ["office_visit", "telehealth", "procedure", "follow_up", "new_patient"]
            },
            preferred_datetime: {
                type: "string",
                format: "date-time"
            },
            duration_minutes: {
                type: "integer",
                minimum: 15,
                maximum: 240,
                default: 30
            },
            reason: {
                type: "string"
            },
            tenant_id: {
                type: "string",
                format: "uuid"
            }
        },
        required: ["action", "patient_id", "tenant_id"]
    },

    outputSchema: {
        type: "object",
        properties: {
            appointment: {
                type: "object",
                properties: {
                    appointment_id: {
                        type: "string",
                        format: "uuid"
                    },
                    patient_id: {
                        type: "string",
                        format: "uuid"
                    },
                    provider_id: {
                        type: "string",
                        format: "uuid"
                    },
                    scheduled_datetime: {
                        type: "string",
                        format: "date-time"
                    },
                    duration_minutes: {
                        type: "integer"
                    },
                    status: {
                        type: "string",
                        enum: ["scheduled", "confirmed", "cancelled", "completed"]
                    }
                }
            },
            available_slots: {
                type: "array",
                items: {
                    type: "string",
                    format: "date-time"
                },
                description: "Returned when action=find_available"
            },
            conflicts: {
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
        const { input, db, tenant } = context;
        const {
            action = 'create',
            appointment_id,
            patient_id,
            provider_id,
            appointment_type,
            preferred_datetime,
            duration_minutes = 30,
            reason,
            tenant_id
        } = input;

        if (!tenant_id || !patient_id) {
            throw new Error('tenant_id and patient_id are required');
        }

        await db.setTenantContext(tenant_id);

        switch (action) {
            case 'create':
                return await this.createAppointment(db, input);

            case 'find_available':
                return await this.findAvailableSlots(db, input);

            case 'cancel':
                return await this.cancelAppointment(db, appointment_id, tenant_id);

            case 'update':
                return await this.updateAppointment(db, appointment_id, input);

            default:
                throw new Error(`Unknown action: ${action}`);
        }
    },

    async createAppointment(db, input) {
        const { patient_id, provider_id, appointment_type, preferred_datetime, duration_minutes, reason, tenant_id } = input;

        // Check for conflicts
        const conflicts = await this.checkConflicts(db, provider_id, preferred_datetime, duration_minutes);

        if (conflicts.length > 0) {
            return {
                appointment: null,
                conflicts,
                available_slots: await this.findNearbySlots(db, provider_id, preferred_datetime, duration_minutes)
            };
        }

        // Create appointment
        const result = await db.query(
            `INSERT INTO appointments (tenant_id, patient_id, provider_id, appointment_type, scheduled_datetime, duration_minutes, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled')
       RETURNING *`,
            [tenant_id, patient_id, provider_id, appointment_type, preferred_datetime, duration_minutes, reason]
        );

        return {
            appointment: result.rows[0],
            conflicts: [],
            audit_id: crypto.randomUUID()
        };
    },

    async findAvailableSlots(db, input) {
        const { provider_id, preferred_datetime, duration_minutes, tenant_id } = input;

        const slots = await this.findNearbySlots(db, provider_id, preferred_datetime, duration_minutes, 10);

        return {
            available_slots: slots,
            audit_id: crypto.randomUUID()
        };
    },

    async cancelAppointment(db, appointmentId, tenantId) {
        const result = await db.query(
            `UPDATE appointments SET status = 'cancelled', cancelled_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
            [appointmentId, tenantId]
        );

        if (result.rows.length === 0) {
            throw new Error('Appointment not found');
        }

        return {
            appointment: result.rows[0],
            audit_id: crypto.randomUUID()
        };
    },

    async updateAppointment(db, appointmentId, input) {
        const { scheduled_datetime, duration_minutes, reason } = input;

        const result = await db.query(
            `UPDATE appointments
       SET scheduled_datetime = COALESCE($1, scheduled_datetime),
           duration_minutes = COALESCE($2, duration_minutes),
           reason = COALESCE($3, reason)
       WHERE id = $4
       RETURNING *`,
            [scheduled_datetime, duration_minutes, reason, appointmentId]
        );

        return {
            appointment: result.rows[0],
            audit_id: crypto.randomUUID()
        };
    },

    async checkConflicts(db, providerId, datetime, duration) {
        const endTime = new Date(new Date(datetime).getTime() + duration * 60000).toISOString();

        const result = await db.query(
            `SELECT * FROM appointments
       WHERE provider_id = $1
         AND status NOT IN ('cancelled', 'completed')
         AND (
           (scheduled_datetime <= $2 AND scheduled_datetime + (duration_minutes || ' minutes')::interval > $2)
           OR
           (scheduled_datetime < $3 AND scheduled_datetime + (duration_minutes || ' minutes')::interval >= $3)
         )`,
            [providerId, datetime, endTime]
        );

        return result.rows;
    },

    async findNearbySlots(db, providerId, preferredDatetime, duration, count = 5) {
        // Simplified: return next available slots (9 AM - 5 PM, 30-min intervals)
        const slots = [];
        const startDate = new Date(preferredDatetime);

        for (let i = 0; i < count; i++) {
            const slotTime = new Date(startDate.getTime() + i * 30 * 60000);
            const conflicts = await this.checkConflicts(db, providerId, slotTime.toISOString(), duration);

            if (conflicts.length === 0) {
                slots.push(slotTime.toISOString());
            }
        }

        return slots;
    }
};
