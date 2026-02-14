const crypto = require('crypto');

const SOX_CONTROLS = [
  { id: 'SOX-001', name: 'Segregation of Duties', section: '404', critical: true },
  { id: 'SOX-002', name: 'Transaction Authorization', section: '404', critical: true },
  { id: 'SOX-003', name: 'Access Controls', section: '404', critical: true },
  { id: 'SOX-004', name: 'Audit Trail', section: '302', critical: true },
  { id: 'SOX-005', name: 'Documentation', section: '302', critical: false },
  { id: 'SOX-006', name: 'Change Management', section: '404', critical: false },
  { id: 'SOX-007', name: 'Reconciliation Review', section: '404', critical: true },
  { id: 'SOX-008', name: 'Management Certification', section: '302', critical: true },
  { id: 'SOX-009', name: 'Internal Audit', section: '404', critical: false },
  { id: 'SOX-010', name: 'Whistleblower Procedures', section: '301', critical: false }
];

module.exports = {
  name: 'compliance-check-sox',
  description: 'Validate workflows against SOX compliance rules',
  vertical: 'finance',
  tier: 2,

  inputSchema: {
    type: 'object',
    properties: {
      controls: { type: 'array',
 items: { type: 'object' } },
      transactions: { type: 'array',
 items: { type: 'object' } },
      users: { type: 'array',
 items: { type: 'object' } },
      period: { type: 'object' },
      tenant_id: { type: 'string' }
    },
    required: ['tenant_id']
  },

  async execute(context) {
    const { input, audit } = context;
    const { controls = [], transactions = [], users = [], period, tenant_id } = input;

    const results = [];
    const controlMap = new Map(controls.map(c => [c.id, c]));

    for (const soxControl of SOX_CONTROLS) {
      const impl = controlMap.get(soxControl.id);

      const result = {
        control_id: soxControl.id,
        name: soxControl.name,
        section: soxControl.section,
        critical: soxControl.critical,
        implemented: !!impl,
        tested: impl?.tested || false,
        effective: impl?.effective || false,
        evidence: impl?.evidence || [],
        findings: []
      };

      // Run specific checks
      if (soxControl.id === 'SOX-001') {
        // Segregation of duties - check if same user approves and executes
        const violations = transactions.filter(t => t.created_by === t.approved_by && t.approved_by);
        if (violations.length > 0) {
          result.findings.push(`${violations.length} transactions where same user created and approved`);
          result.effective = false;
        }
      }

      if (soxControl.id === 'SOX-004') {
        // Audit trail - check for gaps
        const withAudit = transactions.filter(t => t.audit_id || t.logged);
        if (withAudit.length < transactions.length) {
          result.findings.push(`${transactions.length - withAudit.length} transactions missing audit trail`);
          result.effective = false;
        }
      }

      if (soxControl.id === 'SOX-002') {
        // Authorization - check for unauthorized transactions
        const unauthorized = transactions.filter(t => !t.approved_by && Math.abs(t.amount) > 1000);
        if (unauthorized.length > 0) {
          result.findings.push(`${unauthorized.length} transactions over $1000 without approval`);
          result.effective = false;
        }
      }

      result.status = !result.implemented ? 'NOT_IMPLEMENTED' :
        !result.tested ? 'NOT_TESTED' :
          !result.effective ? 'DEFICIENT' : 'EFFECTIVE';

      results.push(result);
    }

    const summary = {
      total_controls: results.length,
      implemented: results.filter(r => r.implemented).length,
      tested: results.filter(r => r.tested).length,
      effective: results.filter(r => r.effective).length,
      deficient: results.filter(r => r.status === 'DEFICIENT').length,
      critical_deficiencies: results.filter(r => r.critical && r.status === 'DEFICIENT').length
    };

    const overallStatus = summary.critical_deficiencies > 0 ? 'MATERIAL_WEAKNESS' :
      summary.deficient > 2 ? 'SIGNIFICANT_DEFICIENCY' : 'EFFECTIVE';

    await audit?.log({
      tenantId: tenant_id,
      action: 'SOX_COMPLIANCE_CHECK',
      resourceType: 'compliance',
      skillName: 'compliance-check-sox',
      meta: summary
    });

    return {
      success: true,
      check_id: crypto.randomUUID(),
      period,
      results,
      summary,
      overall_status: overallStatus,
      recommendation: overallStatus === 'EFFECTIVE' ? 'Controls operating effectively' :
        'Remediation required before certification'
    };
  }
};
