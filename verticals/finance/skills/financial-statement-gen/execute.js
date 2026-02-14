const crypto = require('crypto');

module.exports = {
  name: 'financial-statement-gen',
  description: 'Generate Balance Sheets and P&L statements',
  vertical: 'finance',
  tier: 2,

  inputSchema: {
    type: 'object',
    properties: {
      accounts: { type: 'array',
 items: { type: 'object' } },
      transactions: { type: 'array',
 items: { type: 'object' } },
      period: { type: 'object' },
      statement_type: { type: 'string', enum: ['balance_sheet', 'income_statement', 'cash_flow', 'all'], default: 'all' },
      tenant_id: { type: 'string' }
    },
    required: ['accounts', 'tenant_id']
  },

  async execute(context) {
    const { input, audit } = context;
    const { accounts, transactions = [], period, statement_type = 'all', tenant_id } = input;

    const statements = {};

    // Categorize accounts
    const assets = accounts.filter(a => a.type === 'asset');
    const liabilities = accounts.filter(a => a.type === 'liability');
    const equity = accounts.filter(a => a.type === 'equity');
    const revenue = accounts.filter(a => a.type === 'revenue');
    const expenses = accounts.filter(a => a.type === 'expense');

    const sum = (arr) => arr.reduce((s, a) => s + (a.balance || 0), 0);

    // Balance Sheet
    if (statement_type === 'all' || statement_type === 'balance_sheet') {
      const totalAssets = sum(assets);
      const totalLiabilities = sum(liabilities);
      const totalEquity = sum(equity);

      statements.balance_sheet = {
        as_of: period?.end || new Date().toISOString().split('T')[0],
        assets: {
          current: assets.filter(a => a.current).map(a => ({ name: a.name, balance: a.balance })),
          non_current: assets.filter(a => !a.current).map(a => ({ name: a.name, balance: a.balance })),
          total: totalAssets
        },
        liabilities: {
          current: liabilities.filter(a => a.current).map(a => ({ name: a.name, balance: a.balance })),
          non_current: liabilities.filter(a => !a.current).map(a => ({ name: a.name, balance: a.balance })),
          total: totalLiabilities
        },
        equity: {
          accounts: equity.map(a => ({ name: a.name, balance: a.balance })),
          total: totalEquity
        },
        total_liabilities_equity: totalLiabilities + totalEquity,
        balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01
      };
    }

    // Income Statement
    if (statement_type === 'all' || statement_type === 'income_statement') {
      const totalRevenue = sum(revenue);
      const totalExpenses = sum(expenses);
      const netIncome = totalRevenue - totalExpenses;

      statements.income_statement = {
        period: period || { start: null, end: new Date().toISOString().split('T')[0] },
        revenue: {
          accounts: revenue.map(a => ({ name: a.name, amount: a.balance })),
          total: totalRevenue
        },
        expenses: {
          accounts: expenses.map(a => ({ name: a.name, amount: a.balance })),
          total: totalExpenses
        },
        gross_profit: totalRevenue,
        operating_income: netIncome,
        net_income: netIncome,
        profit_margin: totalRevenue > 0 ? ((netIncome / totalRevenue) * 100).toFixed(2) + '%' : 'N/A'
      };
    }

    // Cash Flow (simplified)
    if (statement_type === 'all' || statement_type === 'cash_flow') {
      const operating = transactions.filter(t => ['revenue', 'expense'].includes(t.category));
      const investing = transactions.filter(t => ['asset', 'investment'].includes(t.category));
      const financing = transactions.filter(t => ['loan', 'equity', 'dividend'].includes(t.category));

      statements.cash_flow = {
        period: period,
        operating_activities: {
          net_cash: operating.reduce((s, t) => s + t.amount, 0),
          transactions: operating.length
        },
        investing_activities: {
          net_cash: investing.reduce((s, t) => s + t.amount, 0),
          transactions: investing.length
        },
        financing_activities: {
          net_cash: financing.reduce((s, t) => s + t.amount, 0),
          transactions: financing.length
        },
        net_change: transactions.reduce((s, t) => s + t.amount, 0)
      };
    }

    await audit?.log({
      tenantId: tenant_id,
      action: 'FINANCIAL_STATEMENT_GENERATED',
      resourceType: 'financial_statement',
      skillName: 'financial-statement-gen',
      meta: { statement_types: Object.keys(statements) }
    });

    return {
      success: true,
      statement_id: crypto.randomUUID(),
      generated_at: new Date().toISOString(),
      period,
      statements,
      metadata: {
        accounts_count: accounts.length,
        transactions_count: transactions.length
      }
    };
  }
};
