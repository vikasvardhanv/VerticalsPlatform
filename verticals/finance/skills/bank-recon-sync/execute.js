const crypto = require('crypto');

module.exports = {
  name: 'bank-recon-sync',
  description: 'Synchronize and reconcile bank statements with ledger',
  vertical: 'finance',
  tier: 1,

  inputSchema: {
    type: 'object',
    properties: {
      bank_transactions: {
        type: 'array',
        items: { type: 'object' },
        description: 'Bank transactions to reconcile'
      },
      ledger_entries: {
        type: 'array',
        items: { type: 'object' },
        description: 'Ledger entries to match against (optional - if not provided, returns bank transaction summary only)'
      },
      profile_name: {
        type: 'string',
        description: 'Profile name to auto-load bank transactions from documents'
      },
      tolerance_days: { type: 'number', default: 3 },
      tolerance_amount: { type: 'number', default: 0.01 },
      tenant_id: { type: 'string' }
    },
    required: ['tenant_id']
  },

  async execute(context) {
    const { input, audit, db } = context;
    let { bank_transactions, ledger_entries = [], tolerance_days = 3, tolerance_amount = 0.01, tenant_id, profile_name } = input;

    // Auto-load bank transactions from documents if profile_name provided
    if ((!bank_transactions || bank_transactions.length === 0) && profile_name && db) {
      try {
        const docResult = await db.query(`
          SELECT extracted_data
          FROM documents
          WHERE tenant_id = $1 AND profile_name = $2 AND deleted_at IS NULL AND status = 'processed'
        `, [tenant_id, profile_name]);

        bank_transactions = [];
        for (const row of docResult.rows) {
          const data = row.extracted_data;
          if (data && data.transactions && Array.isArray(data.transactions)) {
            bank_transactions.push(...data.transactions);
          }
        }
      } catch (error) {
        console.error('Error loading bank transactions:', error.message);
      }
    }

    if (!bank_transactions || bank_transactions.length === 0) {
      return {
        success: false,
        error: 'No bank transactions provided. Either provide bank_transactions array or profile_name to auto-load.',
        help: 'Usage: Provide either bank_transactions OR profile_name (to load from documents)'
      };
    }

    // If no ledger entries provided, return bank summary only
    if (!ledger_entries || ledger_entries.length === 0) {
      const bankTotal = bank_transactions.reduce((s, t) => s + (t.amount || 0), 0);

      return {
        success: true,
        recon_id: crypto.randomUUID(),
        mode: 'BANK_SUMMARY_ONLY',
        bank_transactions,
        summary: {
          bank_transactions: bank_transactions.length,
          bank_total: Math.round(bankTotal * 100) / 100,
          note: 'No ledger entries provided. Showing bank transactions only. To reconcile against ledger, provide ledger_entries parameter.'
        },
        message: `Found ${bank_transactions.length} bank transactions totaling $${Math.round(Math.abs(bankTotal) * 100) / 100}. No ledger data to reconcile against.`
      };
    }

    const matched = [];
    const unmatchedBank = [];
    const unmatchedLedger = [];
    const duplicates = [];

    const ledgerUsed = new Set();

    for (const bankTx of bank_transactions) {
      const bankDate = new Date(bankTx.date);
      const bankAmt = Math.abs(bankTx.amount);
      let bestMatch = null;
      let bestScore = 0;

      for (let i = 0; i < ledger_entries.length; i++) {
        if (ledgerUsed.has(i)) continue;

        const ledgerTx = ledger_entries[i];
        const ledgerDate = new Date(ledgerTx.date);
        const ledgerAmt = Math.abs(ledgerTx.amount);

        const daysDiff = Math.abs((bankDate - ledgerDate) / (1000 * 60 * 60 * 24));
        const amtDiff = Math.abs(bankAmt - ledgerAmt);

        if (amtDiff <= tolerance_amount && daysDiff <= tolerance_days) {
          const score = (1 - amtDiff) * 50 + (1 - daysDiff / tolerance_days) * 50;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = { index: i, ledgerTx, daysDiff, amtDiff };
          }
        }
      }

      if (bestMatch && bestScore >= 70) {
        ledgerUsed.add(bestMatch.index);
        matched.push({
          bank: { id: bankTx.id, date: bankTx.date, amount: bankTx.amount, description: bankTx.description },
          ledger: { id: bestMatch.ledgerTx.id, date: bestMatch.ledgerTx.date, amount: bestMatch.ledgerTx.amount },
          match_type: bestMatch.amtDiff === 0 && bestMatch.daysDiff === 0 ? 'EXACT' : 'FUZZY',
          confidence: Math.round(bestScore) / 100
        });
      } else {
        unmatchedBank.push(bankTx);
      }
    }

    ledger_entries.forEach((tx, i) => {
      if (!ledgerUsed.has(i)) {
        unmatchedLedger.push(tx);
      }
    });

    // Detect duplicates in bank transactions
    const seen = new Map();
    for (const tx of bank_transactions) {
      const key = `${tx.amount}-${tx.date}`;
      if (seen.has(key)) {
        duplicates.push({ original: seen.get(key), duplicate: tx });
      } else {
        seen.set(key, tx);
      }
    }

    const bankTotal = bank_transactions.reduce((s, t) => s + t.amount, 0);
    const ledgerTotal = ledger_entries.reduce((s, t) => s + t.amount, 0);

    await audit?.log({
      tenantId: tenant_id,
      action: 'BANK_RECONCILIATION',
      resourceType: 'reconciliation',
      skillName: 'bank-recon-sync',
      meta: { matched: matched.length, unmatched: unmatchedBank.length + unmatchedLedger.length }
    });

    return {
      success: true,
      recon_id: crypto.randomUUID(),
      matched,
      unmatched_bank: unmatchedBank,
      unmatched_ledger: unmatchedLedger,
      duplicates,
      summary: {
        bank_transactions: bank_transactions.length,
        ledger_entries: ledger_entries.length,
        matched_count: matched.length,
        match_rate: (matched.length / bank_transactions.length * 100).toFixed(1) + '%',
        bank_total: Math.round(bankTotal * 100) / 100,
        ledger_total: Math.round(ledgerTotal * 100) / 100,
        difference: Math.round((bankTotal - ledgerTotal) * 100) / 100
      },
      status: matched.length === bank_transactions.length ? 'BALANCED' : 'NEEDS_REVIEW'
    };
  }
};
