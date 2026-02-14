const crypto = require('crypto');

module.exports = {
  name: 'fraud-detection-scan',
  description: 'Scan transactions for anomalous patterns and potential fraud',
  vertical: 'finance',
  tier: 2,

  inputSchema: {
    type: 'object',
    properties: {
      transactions: { type: 'array',
 items: { type: 'object' } },
      historical: { type: 'array', items: { type: 'object' }, default: [] },
      sensitivity: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
      tenant_id: { type: 'string' }
    },
    required: ['transactions', 'tenant_id']
  },

  async execute(context) {
    const { input, audit } = context;
    const { transactions, historical = [], sensitivity = 'medium', tenant_id } = input;

    const thresholds = {
      low: { zScore: 3.0, roundMin: 10000 },
      medium: { zScore: 2.5, roundMin: 5000 },
      high: { zScore: 2.0, roundMin: 1000 }
    }[sensitivity];

    const alerts = [];
    const amounts = transactions.map(t => Math.abs(t.amount));
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const std = Math.sqrt(amounts.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / amounts.length) || 1;

    const knownVendors = new Set(historical.map(t => (t.vendor || '').toLowerCase()));

    for (const tx of transactions) {
      const amt = Math.abs(tx.amount);
      const zScore = (amt - mean) / std;

      // Unusual amount
      if (zScore > thresholds.zScore) {
        alerts.push({
          type: 'UNUSUAL_AMOUNT', severity: zScore > 4 ? 'high' : 'medium',
          transaction_id: tx.id, amount: tx.amount,
          message: `Amount ${amt} is ${zScore.toFixed(1)}x standard deviation above mean`
        });
      }

      // New vendor
      const vendor = (tx.vendor || tx.description || '').toLowerCase();
      if (vendor && !knownVendors.has(vendor) && amt > 1000) {
        alerts.push({
          type: 'NEW_VENDOR', severity: amt > 10000 ? 'high' : 'medium',
          transaction_id: tx.id, vendor: tx.vendor,
          message: `First-time vendor with significant amount $${amt}`
        });
      }

      // Round numbers
      if (amt >= thresholds.roundMin && amt % 1000 === 0) {
        alerts.push({
          type: 'ROUND_NUMBER', severity: 'low',
          transaction_id: tx.id, amount: tx.amount,
          message: `Large round number: $${amt}`
        });
      }
    }

    // Structuring detection
    const byDateVendor = {};
    transactions.forEach(tx => {
      const key = `${(tx.date || '').split('T')[0]}-${(tx.vendor || '').toLowerCase()}`;
      byDateVendor[key] = byDateVendor[key] || [];
      byDateVendor[key].push(tx);
    });

    for (const [key, txs] of Object.entries(byDateVendor)) {
      if (txs.length >= 2) {
        const total = txs.reduce((s, t) => s + Math.abs(t.amount), 0);
        const allUnder = txs.every(t => Math.abs(t.amount) < 9500);
        if (allUnder && total > 10000) {
          alerts.push({
            type: 'POTENTIAL_STRUCTURING', severity: 'critical',
            transaction_ids: txs.map(t => t.id),
            total_amount: total,
            message: `${txs.length} transactions totaling $${total} on same day - possible structuring`
          });
        }
      }
    }

    const riskScore = Math.min(100, alerts.reduce((s, a) =>
      s + ({ critical: 25, high: 15, medium: 8, low: 3 }[a.severity] || 5), 0));

    await audit?.log({
      tenantId: tenant_id,
      action: 'FRAUD_DETECTION_SCAN',
      resourceType: 'transactions',
      skillName: 'fraud-detection-scan',
      meta: { alerts_count: alerts.length, risk_score: riskScore }
    });

    return {
      success: true,
      scan_id: crypto.randomUUID(),
      alerts: alerts.sort((a, b) => ({ critical: 4, high: 3, medium: 2, low: 1 }[b.severity] - { critical: 4, high: 3, medium: 2, low: 1 }[a.severity])),
      risk_score: riskScore,
      risk_level: riskScore >= 75 ? 'CRITICAL' : riskScore >= 50 ? 'HIGH' : riskScore >= 25 ? 'MEDIUM' : 'LOW',
      summary: {
        transactions_scanned: transactions.length,
        alerts_count: alerts.length,
        by_severity: { critical: alerts.filter(a => a.severity === 'critical').length, high: alerts.filter(a => a.severity === 'high').length, medium: alerts.filter(a => a.severity === 'medium').length, low: alerts.filter(a => a.severity === 'low').length }
      }
    };
  }
};
