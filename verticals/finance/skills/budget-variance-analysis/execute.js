const crypto = require('crypto');

module.exports = {
  name: 'budget-variance-analysis',
  description: 'Analyze and flag budget vs actual variances',
  vertical: 'finance',
  tier: 2,

  inputSchema: {
    type: 'object',
    properties: {
      budget: { type: 'array',
 items: { type: 'object' } },
      actuals: { type: 'array',
 items: { type: 'object' } },
      threshold_percent: { type: 'number', default: 10 },
      period: { type: 'object' },
      tenant_id: { type: 'string' }
    },
    required: ['budget', 'actuals', 'tenant_id']
  },

  async execute(context) {
    const { input, audit } = context;
    const { budget, actuals, threshold_percent = 10, period, tenant_id } = input;

    const budgetMap = new Map(budget.map(b => [b.category || b.account, b]));
    const actualMap = new Map();

    // Aggregate actuals by category
    for (const a of actuals) {
      const key = a.category || a.account;
      if (!actualMap.has(key)) {
        actualMap.set(key, { amount: 0, count: 0 });
      }
      actualMap.get(key).amount += Math.abs(a.amount || 0);
      actualMap.get(key).count++;
    }

    const variances = [];
    const alerts = [];

    for (const [category, budgetItem] of budgetMap) {
      const actual = actualMap.get(category) || { amount: 0, count: 0 };
      const budgetAmt = budgetItem.amount || 0;
      const actualAmt = actual.amount;
      const variance = actualAmt - budgetAmt;
      const variancePercent = budgetAmt !== 0 ? (variance / budgetAmt) * 100 : 0;

      const item = {
        category,
        budget: budgetAmt,
        actual: actualAmt,
        variance,
        variance_percent: Math.round(variancePercent * 100) / 100,
        status: Math.abs(variancePercent) <= threshold_percent ? 'ON_TRACK' :
          variancePercent > 0 ? 'OVER_BUDGET' : 'UNDER_BUDGET',
        transaction_count: actual.count
      };

      variances.push(item);

      if (Math.abs(variancePercent) > threshold_percent) {
        alerts.push({
          category,
          severity: Math.abs(variancePercent) > threshold_percent * 2 ? 'high' : 'medium',
          message: `${category}: ${item.status} by ${Math.abs(variancePercent).toFixed(1)}%`,
          variance,
          variance_percent: variancePercent
        });
      }
    }

    // Check for actuals with no budget
    for (const [category, actual] of actualMap) {
      if (!budgetMap.has(category)) {
        variances.push({
          category,
          budget: 0,
          actual: actual.amount,
          variance: actual.amount,
          variance_percent: 100,
          status: 'UNBUDGETED',
          transaction_count: actual.count
        });
        alerts.push({
          category,
          severity: 'high',
          message: `Unbudgeted spending in ${category}: $${actual.amount}`,
          variance: actual.amount
        });
      }
    }

    const totalBudget = budget.reduce((s, b) => s + (b.amount || 0), 0);
    const totalActual = [...actualMap.values()].reduce((s, a) => s + a.amount, 0);

    await audit?.log({
      tenantId: tenant_id,
      action: 'BUDGET_VARIANCE_ANALYSIS',
      resourceType: 'budget',
      skillName: 'budget-variance-analysis',
      meta: { categories: variances.length, alerts: alerts.length }
    });

    return {
      success: true,
      analysis_id: crypto.randomUUID(),
      period,
      variances: variances.sort((a, b) => Math.abs(b.variance_percent) - Math.abs(a.variance_percent)),
      alerts: alerts.sort((a, b) => (b.severity === 'high' ? 1 : 0) - (a.severity === 'high' ? 1 : 0)),
      summary: {
        total_budget: totalBudget,
        total_actual: totalActual,
        total_variance: totalActual - totalBudget,
        total_variance_percent: ((totalActual - totalBudget) / totalBudget * 100).toFixed(2),
        categories_over: variances.filter(v => v.status === 'OVER_BUDGET').length,
        categories_under: variances.filter(v => v.status === 'UNDER_BUDGET').length,
        categories_on_track: variances.filter(v => v.status === 'ON_TRACK').length
      }
    };
  }
};
