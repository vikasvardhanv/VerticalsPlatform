const crypto = require('crypto');

/**
 * Tax Categorization Skill
 * Categorizes transactions into IRS-compliant expense categories
 */
module.exports = {
    name: 'tax-categorize',
    description: 'Categorize transactions into IRS-compliant expense categories for tax preparation',
    vertical: 'finance',
    tier: 1,

    inputSchema: {
        type: 'object',
        properties: {
            transactions: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        date: { type: 'string' },
                        amount: { type: 'number' },
                        description: { type: 'string' },
                        vendor: { type: 'string' }
                    }
                }
            },
            tenant_id: { type: 'string' },
            client_id: { type: 'string' },
            tax_year: { type: 'number' },
            business_type: { type: 'string', enum: ['sole_prop', 'llc', 'scorp', 'ccorp', 'partnership'] }
        },
        required: ['transactions', 'tenant_id']
    },

    outputSchema: {
        type: 'object',
        properties: {
            categorization_id: { type: 'string' },
            categorized: { type: 'array',
 items: { type: 'object' } },
            needs_review: { type: 'array',
 items: { type: 'object' } },
            summary_by_category: { type: 'object' }
        }
    },

    async execute(context) {
        const { input, dlp, audit } = context;
        const { transactions, tenant_id, client_id, tax_year, business_type = 'sole_prop' } = input;

        if (!transactions || !Array.isArray(transactions)) {
            throw new Error('transactions array is required');
        }

        // 1. DLP scan
        const dlpScan = dlp.scan(JSON.stringify(transactions), {
            context: 'finance',
            categories: ['PCI', 'PII']
        });

        // 2. Categorize each transaction
        const categorized = [];
        const needsReview = [];

        for (const tx of transactions) {
            const result = categorizeTransaction(tx, business_type);

            if (result.confidence >= 0.7) {
                categorized.push({
                    ...tx,
                    category: result.category,
                    subcategory: result.subcategory,
                    irs_line: result.irs_line,
                    confidence: result.confidence,
                    deductible: result.deductible
                });
            } else {
                needsReview.push({
                    ...tx,
                    suggested_category: result.category,
                    suggested_subcategory: result.subcategory,
                    confidence: result.confidence,
                    reason: result.reason || 'Low confidence - please verify',
                    alternatives: result.alternatives || []
                });
            }
        }

        // 3. Generate summary by category
        const summaryByCategory = generateCategorySummary(categorized);

        // 4. Audit log
        await audit.log({
            tenantId: tenant_id,
            action: 'TAX_CATEGORIZATION',
            resourceType: 'transactions',
            skillName: 'tax-categorize',
            dlpFindings: dlpScan.findings,
            meta: {
                total_transactions: transactions.length,
                categorized_count: categorized.length,
                needs_review_count: needsReview.length,
                tax_year,
                business_type,
                client_id
            }
        });

        return {
            success: true,
            categorization_id: crypto.randomUUID(),
            tax_year: tax_year || new Date().getFullYear(),
            categorized,
            needs_review: needsReview,
            summary_by_category: summaryByCategory,
            totals: {
                all_transactions: transactions.length,
                auto_categorized: categorized.length,
                needs_review: needsReview.length,
                total_amount: transactions.reduce((sum, tx) => sum + (tx.amount || 0), 0),
                total_deductible: categorized.filter(c => c.deductible).reduce((sum, tx) => sum + tx.amount, 0)
            }
        };
    }
};

/**
 * IRS Schedule C Categories for Business Expenses
 */
const IRS_CATEGORIES = {
    advertising: {
        name: 'Advertising',
        irs_line: 8,
        keywords: ['facebook ads', 'google ads', 'advertising', 'marketing', 'promotion', 'billboard', 'flyer', 'brochure'],
        deductible: true
    },
    car_truck: {
        name: 'Car and Truck Expenses',
        irs_line: 9,
        keywords: ['gas', 'fuel', 'uber', 'lyft', 'parking', 'toll', 'car wash', 'oil change', 'auto repair', 'vehicle'],
        deductible: true
    },
    commissions: {
        name: 'Commissions and Fees',
        irs_line: 10,
        keywords: ['commission', 'referral fee', 'finder fee', 'broker fee'],
        deductible: true
    },
    contract_labor: {
        name: 'Contract Labor',
        irs_line: 11,
        keywords: ['contractor', 'freelancer', 'consultant', 'subcontractor', '1099'],
        deductible: true
    },
    depreciation: {
        name: 'Depreciation',
        irs_line: 13,
        keywords: ['depreciation', 'amortization'],
        deductible: true
    },
    insurance: {
        name: 'Insurance (other than health)',
        irs_line: 15,
        keywords: ['insurance', 'liability', 'professional liability', 'e&o', 'workers comp'],
        deductible: true
    },
    interest_mortgage: {
        name: 'Interest - Mortgage',
        irs_line: '16a',
        keywords: ['mortgage interest', 'home office mortgage'],
        deductible: true
    },
    interest_other: {
        name: 'Interest - Other',
        irs_line: '16b',
        keywords: ['loan interest', 'credit card interest', 'line of credit'],
        deductible: true
    },
    legal_professional: {
        name: 'Legal and Professional Services',
        irs_line: 17,
        keywords: ['attorney', 'lawyer', 'legal', 'accountant', 'cpa', 'bookkeeper', 'tax prep', 'professional services'],
        deductible: true
    },
    office_expense: {
        name: 'Office Expense',
        irs_line: 18,
        keywords: ['office supplies', 'staples', 'office depot', 'paper', 'ink', 'toner', 'pens', 'notebooks'],
        deductible: true
    },
    rent_lease_vehicle: {
        name: 'Rent or Lease - Vehicles',
        irs_line: '20a',
        keywords: ['car lease', 'vehicle lease', 'truck rental'],
        deductible: true
    },
    rent_lease_other: {
        name: 'Rent or Lease - Other',
        irs_line: '20b',
        keywords: ['office rent', 'equipment rental', 'coworking', 'wework', 'regus'],
        deductible: true
    },
    repairs_maintenance: {
        name: 'Repairs and Maintenance',
        irs_line: 21,
        keywords: ['repair', 'maintenance', 'fix', 'service call'],
        deductible: true
    },
    supplies: {
        name: 'Supplies',
        irs_line: 22,
        keywords: ['supplies', 'materials', 'inventory', 'raw materials'],
        deductible: true
    },
    taxes_licenses: {
        name: 'Taxes and Licenses',
        irs_line: 23,
        keywords: ['license', 'permit', 'registration', 'state tax', 'local tax', 'business license'],
        deductible: true
    },
    travel: {
        name: 'Travel',
        irs_line: 24,
        keywords: ['airfare', 'airline', 'hotel', 'lodging', 'flight', 'train', 'amtrak', 'rental car'],
        deductible: true
    },
    meals: {
        name: 'Meals (50% deductible)',
        irs_line: '24b',
        keywords: ['restaurant', 'lunch', 'dinner', 'breakfast', 'doordash', 'grubhub', 'uber eats', 'cafe', 'coffee'],
        deductible: true,
        partial_deduction: 0.5
    },
    utilities: {
        name: 'Utilities',
        irs_line: 25,
        keywords: ['electric', 'gas bill', 'water', 'internet', 'phone', 'cell phone', 'utility'],
        deductible: true
    },
    wages: {
        name: 'Wages',
        irs_line: 26,
        keywords: ['payroll', 'salary', 'wages', 'employee'],
        deductible: true
    },
    software_subscriptions: {
        name: 'Other Expenses - Software/Subscriptions',
        irs_line: 27,
        keywords: ['software', 'subscription', 'saas', 'adobe', 'microsoft', 'zoom', 'slack', 'dropbox', 'google workspace', 'quickbooks'],
        deductible: true
    },
    bank_fees: {
        name: 'Other Expenses - Bank Fees',
        irs_line: 27,
        keywords: ['bank fee', 'wire fee', 'transfer fee', 'overdraft', 'monthly fee'],
        deductible: true
    },
    education_training: {
        name: 'Other Expenses - Education/Training',
        irs_line: 27,
        keywords: ['course', 'training', 'conference', 'seminar', 'workshop', 'certification', 'udemy', 'coursera'],
        deductible: true
    },
    personal: {
        name: 'Personal (Not Deductible)',
        irs_line: null,
        keywords: ['grocery', 'groceries', 'walmart', 'target', 'amazon', 'clothing', 'entertainment', 'netflix', 'spotify'],
        deductible: false
    }
};

/**
 * Categorize a single transaction
 */
function categorizeTransaction(tx, businessType) {
    const description = (tx.description || '').toLowerCase();
    const vendor = (tx.vendor || '').toLowerCase();
    const combined = `${description} ${vendor}`;

    let bestMatch = null;
    let bestScore = 0;
    let alternatives = [];

    for (const [categoryKey, category] of Object.entries(IRS_CATEGORIES)) {
        let score = 0;
        let matchedKeywords = [];

        for (const keyword of category.keywords) {
            if (combined.includes(keyword.toLowerCase())) {
                // Longer keyword matches = higher confidence
                score += keyword.length;
                matchedKeywords.push(keyword);
            }
        }

        if (score > 0) {
            const match = {
                category: categoryKey,
                categoryName: category.name,
                irs_line: category.irs_line,
                deductible: category.deductible,
                partial_deduction: category.partial_deduction,
                score,
                matchedKeywords
            };

            if (score > bestScore) {
                if (bestMatch) alternatives.push(bestMatch);
                bestMatch = match;
                bestScore = score;
            } else {
                alternatives.push(match);
            }
        }
    }

    if (!bestMatch) {
        return {
            category: 'uncategorized',
            subcategory: null,
            irs_line: null,
            confidence: 0,
            deductible: false,
            reason: 'No matching keywords found',
            alternatives: []
        };
    }

    // Calculate confidence based on score and match quality
    const confidence = Math.min(0.95, 0.5 + (bestScore / 20));

    return {
        category: bestMatch.category,
        subcategory: bestMatch.categoryName,
        irs_line: bestMatch.irs_line,
        confidence: Math.round(confidence * 100) / 100,
        deductible: bestMatch.deductible,
        partial_deduction: bestMatch.partial_deduction,
        matched_keywords: bestMatch.matchedKeywords,
        alternatives: alternatives.slice(0, 3).map(a => ({
            category: a.category,
            name: a.categoryName,
            confidence: Math.round((0.5 + a.score / 20) * 100) / 100
        }))
    };
}

/**
 * Generate summary totals by category
 */
function generateCategorySummary(categorized) {
    const summary = {};

    for (const tx of categorized) {
        const cat = tx.category;
        if (!summary[cat]) {
            summary[cat] = {
                category_name: tx.subcategory,
                irs_line: tx.irs_line,
                transaction_count: 0,
                total_amount: 0,
                deductible_amount: 0
            };
        }

        summary[cat].transaction_count++;
        summary[cat].total_amount += tx.amount || 0;

        if (tx.deductible) {
            const deductionRate = tx.partial_deduction || 1;
            summary[cat].deductible_amount += (tx.amount || 0) * deductionRate;
        }
    }

    // Round amounts
    for (const cat of Object.values(summary)) {
        cat.total_amount = Math.round(cat.total_amount * 100) / 100;
        cat.deductible_amount = Math.round(cat.deductible_amount * 100) / 100;
    }

    return summary;
}
