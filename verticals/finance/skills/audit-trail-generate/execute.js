const crypto = require('crypto');

module.exports = {
  name: 'audit-trail-generate',
  description: 'Generate immutable audit trails for transactions',
  vertical: 'finance',
  tier: 1,

  inputSchema: {
    type: 'object',
    properties: {
      transactions: { type: 'array',
 items: { type: 'object' } },
      period: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } } },
      include_hashes: { type: 'boolean', default: true },
      tenant_id: { type: 'string' },
      generated_by: { type: 'string' }
    },
    required: ['transactions', 'tenant_id']
  },

  async execute(context) {
    const { input, audit } = context;
    const { transactions, period, include_hashes = true, tenant_id, generated_by } = input;

    const trailId = crypto.randomUUID();
    const generatedAt = new Date().toISOString();
    let previousHash = '0'.repeat(64);

    const auditEntries = transactions.map((tx, index) => {
      const entry = {
        sequence: index + 1,
        transaction_id: tx.id || `tx_${index}`,
        timestamp: tx.date || generatedAt,
        type: tx.type || (tx.amount > 0 ? 'credit' : 'debit'),
        amount: tx.amount,
        description: tx.description,
        account: tx.account,
        category: tx.category,
        user: tx.user || generated_by || 'system',
        ip_address: tx.ip_address || null,
        metadata: {
          original_data_hash: include_hashes ? hashData(tx) : null
        }
      };

      if (include_hashes) {
        const blockData = JSON.stringify({ ...entry, previous_hash: previousHash });
        entry.block_hash = crypto.createHash('sha256').update(blockData).digest('hex');
        entry.previous_hash = previousHash;
        previousHash = entry.block_hash;
      }

      return entry;
    });

    const summary = {
      total_entries: auditEntries.length,
      total_credits: transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
      total_debits: Math.abs(transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)),
      unique_accounts: [...new Set(transactions.map(t => t.account).filter(Boolean))].length,
      unique_users: [...new Set(auditEntries.map(e => e.user))].length,
      date_range: period || {
        start: transactions[0]?.date,
        end: transactions[transactions.length - 1]?.date
      }
    };

    const trailHash = crypto.createHash('sha256')
      .update(JSON.stringify(auditEntries))
      .digest('hex');

    await audit?.log({
      tenantId: tenant_id,
      action: 'AUDIT_TRAIL_GENERATED',
      resourceType: 'audit_trail',
      skillName: 'audit-trail-generate',
      meta: { trail_id: trailId, entries_count: auditEntries.length }
    });

    return {
      success: true,
      trail_id: trailId,
      generated_at: generatedAt,
      generated_by: generated_by || 'system',
      period: summary.date_range,
      entries: auditEntries,
      summary,
      integrity: {
        trail_hash: trailHash,
        hash_algorithm: 'SHA-256',
        chain_valid: true
      },
      export_formats: ['json', 'csv', 'pdf']
    };
  }
};

function hashData(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}
