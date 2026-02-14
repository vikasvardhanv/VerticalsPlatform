const crypto = require('crypto');

const IRS_CATEGORIES = {
  advertising: { line: 8, deductible: 1.0, keywords: ['facebook ads', 'google ads', 'marketing', 'advertising', 'ad spend', 'social media'] },
  car_truck: { line: 9, deductible: 1.0, keywords: ['gas', 'fuel', 'uber', 'lyft', 'parking', 'toll', 'mileage', 'vehicle'] },
  commissions: { line: 10, deductible: 1.0, keywords: ['commission', 'referral fee', 'affiliate'] },
  contract_labor: { line: 11, deductible: 1.0, keywords: ['contractor', 'freelancer', 'consultant', 'upwork', 'fiverr'] },
  depreciation: { line: 13, deductible: 1.0, keywords: ['depreciation'] },
  insurance: { line: 15, deductible: 1.0, keywords: ['insurance', 'liability', 'workers comp', 'business insurance'] },
  interest: { line: 16, deductible: 1.0, keywords: ['interest', 'loan interest', 'business loan'] },
  legal_professional: { line: 17, deductible: 1.0, keywords: ['attorney', 'lawyer', 'cpa', 'accountant', 'legal', 'tax prep'] },
  office_expense: { line: 18, deductible: 1.0, keywords: ['office supplies', 'staples', 'paper', 'ink', 'printer', 'desk'] },
  rent_lease: { line: 20, deductible: 1.0, keywords: ['rent', 'lease', 'coworking', 'office space', 'studio'] },
  repairs: { line: 21, deductible: 1.0, keywords: ['repair', 'maintenance', 'fix'] },
  supplies: { line: 22, deductible: 1.0, keywords: ['supplies', 'materials', 'inventory'] },
  taxes_licenses: { line: 23, deductible: 1.0, keywords: ['license', 'permit', 'registration', 'business tax'] },
  travel: { line: 24, deductible: 1.0, keywords: ['airfare', 'hotel', 'flight', 'lodging', 'conference'] },
  meals: { line: 24, deductible: 0.5, keywords: ['restaurant', 'lunch', 'dinner', 'doordash', 'grubhub', 'coffee', 'meal'] },
  utilities: { line: 25, deductible: 1.0, keywords: ['electric', 'phone', 'internet', 'utility', 'mobile', 'broadband'] },
  wages: { line: 26, deductible: 1.0, keywords: ['payroll', 'salary', 'wages', 'employee'] },
  other: { line: 27, deductible: 1.0, keywords: ['software', 'subscription', 'bank fee', 'saas', 'hosting', 'domain', 'cloud'] }
};

module.exports = {
  name: 'tax-prep-automate',
  description: 'Automate tax document categorization and preparation for CPAs',
  vertical: 'finance',
  tier: 1,

  inputSchema: {
    type: 'object',
    properties: {
      transactions: {
        type: 'array',
        items: { type: 'object' },
        description: 'Array of transaction objects with date, amount, description, vendor'
      },
      tax_year: { type: 'integer' },
      entity_type: { type: 'string', enum: ['individual', 'llc', 'corp', 'nonprofit'] },
      profile_name: {
        type: 'string',
        description: 'Profile name to load documents from database'
      },
      tenant_id: { type: 'string' }
    },
    required: ['tax_year', 'tenant_id']
  },

  async execute(context) {
    const { input, audit, db } = context;
    const { tax_year, entity_type = 'individual', tenant_id, profile_name } = input;
    let { transactions } = input;

    // If no transactions provided but profile_name is given, fetch from documents
    if ((!transactions || transactions.length === 0) && profile_name && db) {
      const docResult = await db.query(`
        SELECT extracted_data
        FROM documents
        WHERE tenant_id = $1 AND profile_name = $2 AND deleted_at IS NULL AND status = 'processed'
      `, [tenant_id, profile_name]);

      transactions = [];

      for (const row of docResult.rows) {
        const data = row.extracted_data;
        if (data && data.transactions && Array.isArray(data.transactions)) {
          transactions.push(...data.transactions);
        }
      }

      if (transactions.length === 0) {
        return {
          success: false,
          error: 'No transaction data found in documents. Please ensure documents have been processed with doc-extract skill first.',
          recommendation: 'Upload bank statements, credit card statements, or receipts with detailed transaction information.',
          help: 'Ask me to "extract transactions from documents" first, then try categorizing again.'
        };
      }
    }

    // Validate we have transactions
    if (!transactions || transactions.length === 0) {
      return {
        success: false,
        error: 'No transactions provided',
        help: 'Provide either transactions array or profile_name to load from documents'
      };
    }

    const categorized = [];
    const needsReview = [];
    const byCategory = {};
    const warnings = [];

    for (const tx of transactions) {
      const desc = (tx.description || tx.vendor || '').toLowerCase();
      const vendor = (tx.vendor || '').toLowerCase();
      const combinedText = `${desc} ${vendor}`;

      // Skip if this looks like a summary transaction
      if (desc.includes('total deposits') || desc.includes('total withdrawals') ||
          desc.includes('starting balance') || desc.includes('ending balance')) {
        warnings.push({
          transaction: tx,
          warning: 'Skipped summary transaction - not a deductible expense'
        });
        continue;
      }

      let matched = null;
      let bestScore = 0;

      for (const [catKey, cat] of Object.entries(IRS_CATEGORIES)) {
        for (const kw of cat.keywords) {
          if (combinedText.includes(kw)) {
            const score = kw.length;
            if (score > bestScore) {
              bestScore = score;
              matched = { key: catKey, ...cat };
            }
          }
        }
      }

      const amount = Math.abs(parseFloat(tx.amount) || 0);

      // Only categorize expenses (negative amounts or debits)
      const isExpense = (tx.amount < 0) || (tx.type === 'debit') || (tx.type === 'withdrawal');

      if (!isExpense) {
        // Skip deposits/credits - not expenses
        continue;
      }

      if (matched && bestScore >= 3) {
        const result = {
          ...tx,
          category: matched.key,
          category_label: matched.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          irs_line: matched.line,
          deductible_rate: matched.deductible,
          deductible_amount: amount * matched.deductible,
          confidence: Math.min(0.95, 0.5 + bestScore / 20)
        };
        categorized.push(result);

        if (!byCategory[matched.key]) {
          byCategory[matched.key] = {
            total: 0,
            deductible: 0,
            count: 0,
            irs_line: matched.line,
            category_label: result.category_label
          };
        }
        byCategory[matched.key].total += amount;
        byCategory[matched.key].deductible += result.deductible_amount;
        byCategory[matched.key].count++;
      } else {
        needsReview.push({
          ...tx,
          reason: 'No matching IRS category found - manual review required',
          suggestion: 'Provide more details in description or vendor name'
        });
      }
    }

    const totalDeductible = Object.values(byCategory).reduce((sum, c) => sum + c.deductible, 0);
    const totalExpenses = categorized.reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0);

    await audit?.log({
      tenantId: tenant_id,
      action: 'TAX_PREP_CATEGORIZATION',
      resourceType: 'transactions',
      skillName: 'tax-prep-automate',
      meta: {
        tax_year,
        entity_type,
        profile_name,
        total_transactions: transactions.length,
        categorized_count: categorized.length,
        needs_review_count: needsReview.length
      }
    });

    return {
      success: true,
      prep_id: crypto.randomUUID(),
      tax_year,
      entity_type,
      profile_name,
      categorized,
      needs_review: needsReview,
      warnings: warnings.length > 0 ? warnings : undefined,
      summary_by_category: byCategory,
      totals: {
        transactions: transactions.length,
        categorized: categorized.length,
        needs_review: needsReview.length,
        total_expenses: Math.round(totalExpenses * 100) / 100,
        total_deductible: Math.round(totalDeductible * 100) / 100
      },
      recommendations: generateRecommendations(categorized, needsReview, byCategory)
    };
  }
};

function generateRecommendations(categorized, needsReview, byCategory) {
  const recs = [];

  // Check for high needs_review percentage
  const total = categorized.length + needsReview.length;
  if (needsReview.length > 0 && needsReview.length / total > 0.3) {
    recs.push({
      type: 'warning',
      message: `${needsReview.length} transactions need manual review (${Math.round(needsReview.length / total * 100)}%). Consider adding more detailed descriptions to improve auto-categorization.`
    });
  }

  // Check for meals deduction
  if (byCategory.meals) {
    recs.push({
      type: 'info',
      message: `Meals are subject to 50% deduction limit. Total meals: $${byCategory.meals.total.toFixed(2)}, Deductible: $${byCategory.meals.deductible.toFixed(2)}`
    });
  }

  // Check for vehicle expenses
  if (byCategory.car_truck && byCategory.car_truck.total > 500) {
    recs.push({
      type: 'info',
      message: 'Consider comparing actual expenses vs. standard mileage deduction for vehicle expenses.'
    });
  }

  // Success message
  if (categorized.length > 0) {
    recs.push({
      type: 'success',
      message: `Successfully categorized ${categorized.length} transactions into ${Object.keys(byCategory).length} IRS expense categories.`
    });
  }

  return recs;
}
