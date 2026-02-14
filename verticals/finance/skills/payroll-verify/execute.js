const crypto = require('crypto');

const FEDERAL_TAX_BRACKETS_2024 = [
  { min: 0, max: 11600, rate: 0.10 },
  { min: 11600, max: 47150, rate: 0.12 },
  { min: 47150, max: 100525, rate: 0.22 },
  { min: 100525, max: 191950, rate: 0.24 },
  { min: 191950, max: 243725, rate: 0.32 },
  { min: 243725, max: 609350, rate: 0.35 },
  { min: 609350, max: Infinity, rate: 0.37 }
];

module.exports = {
  name: 'payroll-verify',
  description: 'Validate payroll records for errors and compliance',
  vertical: 'finance',
  tier: 2,

  inputSchema: {
    type: 'object',
    properties: {
      payroll_records: { type: 'array',
 items: { type: 'object' } },
      pay_period: { type: 'object' },
      check_overtime: { type: 'boolean', default: true },
      tenant_id: { type: 'string' }
    },
    required: ['payroll_records', 'tenant_id']
  },

  async execute(context) {
    const { input, audit } = context;
    const { payroll_records, pay_period, check_overtime = true, tenant_id } = input;

    const results = [];
    const errors = [];
    const warnings = [];

    for (const record of payroll_records) {
      const validation = {
        employee_id: record.employee_id,
        employee_name: record.employee_name,
        checks: []
      };

      // Gross pay calculation
      const hours = record.regular_hours || 0;
      const otHours = record.overtime_hours || 0;
      const rate = record.hourly_rate || record.salary / 2080;
      const expectedGross = (hours * rate) + (otHours * rate * 1.5);

      if (Math.abs(expectedGross - (record.gross_pay || 0)) > 0.01) {
        validation.checks.push({ name: 'Gross Pay', status: 'FAIL', expected: expectedGross, actual: record.gross_pay });
        errors.push({ employee_id: record.employee_id, type: 'GROSS_PAY_MISMATCH', expected: expectedGross, actual: record.gross_pay });
      } else {
        validation.checks.push({ name: 'Gross Pay', status: 'PASS' });
      }

      // Overtime compliance
      if (check_overtime && hours > 40 && otHours === 0 && !record.exempt) {
        validation.checks.push({ name: 'Overtime', status: 'FAIL', message: 'Over 40 hours but no overtime recorded' });
        errors.push({ employee_id: record.employee_id, type: 'OVERTIME_MISSING', hours, overtime_hours: otHours });
      } else {
        validation.checks.push({ name: 'Overtime', status: 'PASS' });
      }

      // Social Security / Medicare
      const ssWithholding = record.gross_pay * 0.062;
      const mcWithholding = record.gross_pay * 0.0145;
      if (Math.abs((record.ss_withheld || 0) - ssWithholding) > 1) {
        warnings.push({ employee_id: record.employee_id, type: 'SS_WITHHOLDING', expected: ssWithholding, actual: record.ss_withheld });
      }

      // Negative net pay
      if ((record.net_pay || 0) < 0) {
        errors.push({ employee_id: record.employee_id, type: 'NEGATIVE_NET_PAY', net_pay: record.net_pay });
        validation.checks.push({ name: 'Net Pay', status: 'FAIL', message: 'Negative net pay' });
      }

      // Ghost employee check (no SSN or address)
      if (!record.ssn && !record.address) {
        warnings.push({ employee_id: record.employee_id, type: 'POSSIBLE_GHOST', message: 'Missing SSN and address' });
      }

      validation.overall = validation.checks.every(c => c.status === 'PASS') ? 'VALID' : 'INVALID';
      results.push(validation);
    }

    const totalGross = payroll_records.reduce((s, r) => s + (r.gross_pay || 0), 0);
    const totalNet = payroll_records.reduce((s, r) => s + (r.net_pay || 0), 0);

    await audit?.log({
      tenantId: tenant_id,
      action: 'PAYROLL_VERIFICATION',
      resourceType: 'payroll',
      skillName: 'payroll-verify',
      meta: { records: payroll_records.length, errors: errors.length }
    });

    return {
      success: true,
      verification_id: crypto.randomUUID(),
      pay_period,
      results,
      errors,
      warnings,
      summary: {
        total_records: payroll_records.length,
        valid: results.filter(r => r.overall === 'VALID').length,
        invalid: results.filter(r => r.overall === 'INVALID').length,
        total_gross: Math.round(totalGross * 100) / 100,
        total_net: Math.round(totalNet * 100) / 100,
        total_errors: errors.length,
        total_warnings: warnings.length
      },
      status: errors.length === 0 ? 'APPROVED' : 'NEEDS_CORRECTION'
    };
  }
};
