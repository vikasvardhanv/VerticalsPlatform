const crypto = require('crypto');

/**
 * Transaction Matching Skill
 * Reconciles bank transactions with internal ledger entries
 */
module.exports = {
    name: 'transaction-match',
    description: 'Match and reconcile bank transactions with internal ledger entries',
    vertical: 'finance',
    tier: 1,

    inputSchema: {
        type: 'object',
        properties: {
            bank_transactions: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        date: { type: 'string' },
                        amount: { type: 'number' },
                        description: { type: 'string' },
                        type: { type: 'string', enum: ['debit', 'credit'] }
                    }
                }
            },
            ledger_entries: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        date: { type: 'string' },
                        amount: { type: 'number' },
                        description: { type: 'string' },
                        reference: { type: 'string' }
                    }
                }
            },
            tenant_id: { type: 'string' },
            client_id: { type: 'string' },
            match_tolerance_days: { type: 'number', default: 3 },
            match_tolerance_amount: { type: 'number', default: 0.01 }
        },
        required: ['bank_transactions', 'ledger_entries', 'tenant_id']
    },

    outputSchema: {
        type: 'object',
        properties: {
            reconciliation_id: { type: 'string' },
            matched: { type: 'array',
 items: { type: 'object' } },
            unmatched_bank: { type: 'array',
 items: { type: 'object' } },
            unmatched_ledger: { type: 'array',
 items: { type: 'object' } },
            duplicates: { type: 'array',
 items: { type: 'object' } },
            summary: { type: 'object' }
        }
    },

    async execute(context) {
        const { input, dlp, audit } = context;
        const {
            bank_transactions,
            ledger_entries,
            tenant_id,
            client_id,
            match_tolerance_days = 3,
            match_tolerance_amount = 0.01
        } = input;

        if (!bank_transactions || !ledger_entries) {
            throw new Error('bank_transactions and ledger_entries are required');
        }

        // 1. DLP scan
        const dlpScan = dlp.scan(JSON.stringify({ bank_transactions, ledger_entries }), {
            context: 'finance',
            categories: ['PCI', 'ACCOUNT_NUMBER']
        });

        // 2. Prepare data structures
        const bankTxs = bank_transactions.map(tx => ({
            ...tx,
            normalizedAmount: Math.abs(tx.amount),
            parsedDate: parseDate(tx.date),
            matched: false
        }));

        const ledgerTxs = ledger_entries.map(tx => ({
            ...tx,
            normalizedAmount: Math.abs(tx.amount),
            parsedDate: parseDate(tx.date),
            matched: false
        }));

        // 3. Find matches
        const matched = [];
        const duplicates = [];

        for (const bankTx of bankTxs) {
            const candidates = findMatchCandidates(
                bankTx,
                ledgerTxs.filter(l => !l.matched),
                match_tolerance_days,
                match_tolerance_amount
            );

            if (candidates.length === 1) {
                // Exact match
                const ledgerTx = candidates[0].ledgerTx;
                matched.push({
                    bank_transaction: sanitizeTx(bankTx),
                    ledger_entry: sanitizeTx(ledgerTx),
                    match_type: candidates[0].matchType,
                    confidence: candidates[0].confidence,
                    date_diff_days: candidates[0].dateDiff,
                    amount_diff: candidates[0].amountDiff
                });
                bankTx.matched = true;
                ledgerTx.matched = true;
            } else if (candidates.length > 1) {
                // Multiple potential matches - flag for review
                duplicates.push({
                    bank_transaction: sanitizeTx(bankTx),
                    potential_matches: candidates.map(c => ({
                        ledger_entry: sanitizeTx(c.ledgerTx),
                        confidence: c.confidence,
                        match_type: c.matchType
                    })),
                    reason: 'Multiple potential matches found'
                });
                bankTx.matched = true; // Mark as handled
            }
        }

        // 4. Collect unmatched
        const unmatchedBank = bankTxs
            .filter(tx => !tx.matched)
            .map(tx => ({
                ...sanitizeTx(tx),
                suggestion: suggestAction(tx, 'bank')
            }));

        const unmatchedLedger = ledgerTxs
            .filter(tx => !tx.matched)
            .map(tx => ({
                ...sanitizeTx(tx),
                suggestion: suggestAction(tx, 'ledger')
            }));

        // 5. Calculate summary
        const summary = {
            total_bank_transactions: bank_transactions.length,
            total_ledger_entries: ledger_entries.length,
            matched_count: matched.length,
            match_rate: Math.round((matched.length / bank_transactions.length) * 100) / 100,
            unmatched_bank_count: unmatchedBank.length,
            unmatched_ledger_count: unmatchedLedger.length,
            duplicate_candidates: duplicates.length,
            bank_total: bank_transactions.reduce((sum, tx) => sum + tx.amount, 0),
            ledger_total: ledger_entries.reduce((sum, tx) => sum + tx.amount, 0),
            difference: Math.round(
                (bank_transactions.reduce((sum, tx) => sum + tx.amount, 0) -
                ledger_entries.reduce((sum, tx) => sum + tx.amount, 0)) * 100
            ) / 100
        };

        // 6. Audit log
        await audit.log({
            tenantId: tenant_id,
            action: 'TRANSACTION_RECONCILIATION',
            resourceType: 'reconciliation',
            skillName: 'transaction-match',
            dlpFindings: dlpScan.findings,
            meta: {
                ...summary,
                client_id
            }
        });

        return {
            success: true,
            reconciliation_id: crypto.randomUUID(),
            matched,
            unmatched_bank: unmatchedBank,
            unmatched_ledger: unmatchedLedger,
            duplicates,
            summary,
            status: getReconciliationStatus(summary)
        };
    }
};

/**
 * Parse date string to Date object
 */
function parseDate(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
}

/**
 * Calculate days difference between two dates
 */
function daysDiff(date1, date2) {
    if (!date1 || !date2) return Infinity;
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.abs(Math.round((date1 - date2) / msPerDay));
}

/**
 * Find matching candidates for a bank transaction
 */
function findMatchCandidates(bankTx, ledgerTxs, toleranceDays, toleranceAmount) {
    const candidates = [];

    for (const ledgerTx of ledgerTxs) {
        const amountDiff = Math.abs(bankTx.normalizedAmount - ledgerTx.normalizedAmount);
        const dateDiff = daysDiff(bankTx.parsedDate, ledgerTx.parsedDate);

        // Check if within tolerance
        if (amountDiff <= toleranceAmount && dateDiff <= toleranceDays) {
            let matchType = 'FUZZY';
            let confidence = 0.7;

            // Exact amount match
            if (amountDiff === 0) {
                confidence += 0.15;
                matchType = dateDiff === 0 ? 'EXACT' : 'EXACT_AMOUNT';
            }

            // Same day match
            if (dateDiff === 0) {
                confidence += 0.1;
            }

            // Description similarity
            const descSimilarity = calculateSimilarity(
                bankTx.description || '',
                ledgerTx.description || ''
            );
            if (descSimilarity > 0.5) {
                confidence += 0.05;
            }

            candidates.push({
                ledgerTx,
                matchType,
                confidence: Math.min(0.99, Math.round(confidence * 100) / 100),
                dateDiff,
                amountDiff
            });
        }
    }

    // Sort by confidence descending
    candidates.sort((a, b) => b.confidence - a.confidence);

    // If top match has high confidence and others are much lower, return only top
    if (candidates.length > 1 &&
        candidates[0].confidence >= 0.9 &&
        candidates[0].confidence - candidates[1].confidence >= 0.1) {
        return [candidates[0]];
    }

    return candidates;
}

/**
 * Calculate string similarity (simple Jaccard)
 */
function calculateSimilarity(str1, str2) {
    const words1 = new Set(str1.toLowerCase().split(/\s+/));
    const words2 = new Set(str2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Remove internal fields before returning
 */
function sanitizeTx(tx) {
    const { normalizedAmount, parsedDate, matched, ...clean } = tx;
    return clean;
}

/**
 * Suggest action for unmatched transactions
 */
function suggestAction(tx, source) {
    if (source === 'bank') {
        if (tx.amount > 0) {
            return 'May need to record as income in ledger';
        }
        return 'May need to record as expense in ledger';
    } else {
        return 'May be pending bank clearance or incorrectly recorded';
    }
}

/**
 * Determine overall reconciliation status
 */
function getReconciliationStatus(summary) {
    if (summary.match_rate >= 0.98 && summary.difference === 0) {
        return {
            status: 'BALANCED',
            message: 'Reconciliation complete. All transactions matched.',
            action_required: false
        };
    }

    if (summary.match_rate >= 0.95) {
        return {
            status: 'MOSTLY_BALANCED',
            message: `${summary.unmatched_bank_count + summary.unmatched_ledger_count} items need review.`,
            action_required: true
        };
    }

    if (summary.match_rate >= 0.80) {
        return {
            status: 'NEEDS_ATTENTION',
            message: 'Significant unmatched transactions. Manual review recommended.',
            action_required: true
        };
    }

    return {
        status: 'REQUIRES_INVESTIGATION',
        message: 'Low match rate. Data quality or timing issues likely.',
        action_required: true
    };
}
