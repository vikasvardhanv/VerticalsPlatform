const crypto = require('crypto');

/**
 * Anomaly Detection Skill
 * Detects unusual patterns and potential fraud in financial transactions
 */
module.exports = {
    name: 'anomaly-detect',
    description: 'Detect unusual patterns, potential fraud, and compliance issues in financial transactions',
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
                        vendor: { type: 'string' },
                        category: { type: 'string' },
                        account: { type: 'string' }
                    }
                }
            },
            historical_transactions: {
                type: 'array',
                items: { type: 'object' },
                description: 'Previous transactions for baseline comparison'
            },
            tenant_id: { type: 'string' },
            client_id: { type: 'string' },
            sensitivity: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' }
        },
        required: ['transactions', 'tenant_id']
    },

    outputSchema: {
        type: 'object',
        properties: {
            scan_id: { type: 'string' },
            alerts: { type: 'array',
 items: { type: 'object' } },
            risk_score: { type: 'number' },
            summary: { type: 'object' }
        }
    },

    async execute(context) {
        const { input, dlp, audit } = context;
        const {
            transactions,
            historical_transactions = [],
            tenant_id,
            client_id,
            sensitivity = 'medium'
        } = input;

        if (!transactions || !Array.isArray(transactions)) {
            throw new Error('transactions array is required');
        }

        // 1. DLP scan
        const dlpScan = dlp.scan(JSON.stringify(transactions), {
            context: 'finance',
            categories: ['PCI', 'PII']
        });

        // 2. Build baseline from historical data
        const baseline = buildBaseline(historical_transactions);

        // 3. Run all anomaly detection rules
        const alerts = [];
        const sensitivityThresholds = getSensitivityThresholds(sensitivity);

        // Rule 1: Unusual amounts
        alerts.push(...detectUnusualAmounts(transactions, baseline, sensitivityThresholds));

        // Rule 2: New/unknown vendors
        alerts.push(...detectNewVendors(transactions, historical_transactions, sensitivityThresholds));

        // Rule 3: Duplicate transactions
        alerts.push(...detectDuplicates(transactions));

        // Rule 4: Round number transactions (potential fraud indicator)
        alerts.push(...detectRoundNumbers(transactions, sensitivityThresholds));

        // Rule 5: Unusual timing
        alerts.push(...detectUnusualTiming(transactions, baseline));

        // Rule 6: Velocity anomalies
        alerts.push(...detectVelocityAnomalies(transactions, baseline, sensitivityThresholds));

        // Rule 7: Split transactions (structuring)
        alerts.push(...detectSplitTransactions(transactions, sensitivityThresholds));

        // 4. Calculate overall risk score
        const riskScore = calculateRiskScore(alerts);

        // 5. Sort alerts by severity
        alerts.sort((a, b) => severityOrder(b.severity) - severityOrder(a.severity));

        // 6. Generate summary
        const summary = {
            total_transactions: transactions.length,
            total_alerts: alerts.length,
            alerts_by_severity: {
                critical: alerts.filter(a => a.severity === 'critical').length,
                high: alerts.filter(a => a.severity === 'high').length,
                medium: alerts.filter(a => a.severity === 'medium').length,
                low: alerts.filter(a => a.severity === 'low').length
            },
            alerts_by_type: groupBy(alerts, 'type'),
            risk_level: getRiskLevel(riskScore)
        };

        // 7. Audit log
        await audit.log({
            tenantId: tenant_id,
            action: 'ANOMALY_DETECTION',
            resourceType: 'transactions',
            skillName: 'anomaly-detect',
            dlpFindings: dlpScan.findings,
            meta: {
                ...summary,
                client_id,
                sensitivity
            }
        });

        return {
            success: true,
            scan_id: crypto.randomUUID(),
            alerts,
            risk_score: riskScore,
            summary,
            recommendations: generateRecommendations(alerts, riskScore)
        };
    }
};

/**
 * Sensitivity thresholds for different levels
 */
function getSensitivityThresholds(sensitivity) {
    const thresholds = {
        low: {
            amountZScore: 3.0,
            roundNumberThreshold: 10000,
            duplicateTimeWindow: 60, // minutes
            velocityMultiplier: 3.0,
            splitThreshold: 9500 // just under $10k reporting
        },
        medium: {
            amountZScore: 2.5,
            roundNumberThreshold: 5000,
            duplicateTimeWindow: 120,
            velocityMultiplier: 2.5,
            splitThreshold: 9000
        },
        high: {
            amountZScore: 2.0,
            roundNumberThreshold: 1000,
            duplicateTimeWindow: 240,
            velocityMultiplier: 2.0,
            splitThreshold: 8000
        }
    };
    return thresholds[sensitivity] || thresholds.medium;
}

/**
 * Build statistical baseline from historical transactions
 */
function buildBaseline(transactions) {
    if (!transactions.length) {
        return {
            meanAmount: 500,
            stdAmount: 1000,
            vendorCounts: {},
            dailyAverage: 5,
            typicalHours: [9, 10, 11, 12, 13, 14, 15, 16, 17]
        };
    }

    const amounts = transactions.map(tx => Math.abs(tx.amount));
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const std = Math.sqrt(
        amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length
    );

    const vendorCounts = {};
    transactions.forEach(tx => {
        const vendor = (tx.vendor || tx.description || 'unknown').toLowerCase();
        vendorCounts[vendor] = (vendorCounts[vendor] || 0) + 1;
    });

    // Calculate daily average
    const dates = new Set(transactions.map(tx => tx.date?.split('T')[0]));
    const dailyAverage = transactions.length / Math.max(dates.size, 1);

    return {
        meanAmount: mean,
        stdAmount: std || mean * 0.5,
        vendorCounts,
        dailyAverage,
        typicalHours: [9, 10, 11, 12, 13, 14, 15, 16, 17]
    };
}

/**
 * Detect unusually large or small transactions
 */
function detectUnusualAmounts(transactions, baseline, thresholds) {
    const alerts = [];

    for (const tx of transactions) {
        const amount = Math.abs(tx.amount);
        const zScore = (amount - baseline.meanAmount) / baseline.stdAmount;

        if (zScore > thresholds.amountZScore) {
            alerts.push({
                type: 'UNUSUAL_AMOUNT',
                severity: zScore > thresholds.amountZScore * 1.5 ? 'high' : 'medium',
                transaction_id: tx.id,
                amount: tx.amount,
                description: tx.description,
                details: {
                    z_score: Math.round(zScore * 100) / 100,
                    baseline_mean: Math.round(baseline.meanAmount * 100) / 100,
                    deviation_factor: Math.round(zScore * 100) / 100 + 'x standard deviation'
                },
                message: `Transaction amount $${amount.toFixed(2)} is unusually high (${Math.round(zScore * 10) / 10}x standard deviation)`
            });
        }
    }

    return alerts;
}

/**
 * Detect transactions with new/unknown vendors
 */
function detectNewVendors(transactions, historical, thresholds) {
    const alerts = [];
    const knownVendors = new Set(
        historical.map(tx => (tx.vendor || tx.description || '').toLowerCase())
    );

    for (const tx of transactions) {
        const vendor = (tx.vendor || tx.description || '').toLowerCase();
        const amount = Math.abs(tx.amount);

        if (!knownVendors.has(vendor) && amount > 1000) {
            alerts.push({
                type: 'NEW_VENDOR',
                severity: amount > 10000 ? 'high' : 'medium',
                transaction_id: tx.id,
                amount: tx.amount,
                vendor: tx.vendor || tx.description,
                message: `First-time vendor "${tx.vendor || tx.description}" with significant amount $${amount.toFixed(2)}`
            });
        }
    }

    return alerts;
}

/**
 * Detect duplicate or near-duplicate transactions
 */
function detectDuplicates(transactions) {
    const alerts = [];
    const seen = new Map();

    for (const tx of transactions) {
        const key = `${tx.amount}-${tx.vendor || tx.description}`;

        if (seen.has(key)) {
            const original = seen.get(key);
            alerts.push({
                type: 'POTENTIAL_DUPLICATE',
                severity: 'medium',
                transaction_id: tx.id,
                amount: tx.amount,
                description: tx.description,
                details: {
                    original_transaction_id: original.id,
                    original_date: original.date
                },
                message: `Potential duplicate: Same amount and vendor as transaction ${original.id}`
            });
        } else {
            seen.set(key, tx);
        }
    }

    return alerts;
}

/**
 * Detect suspiciously round numbers
 */
function detectRoundNumbers(transactions, thresholds) {
    const alerts = [];

    for (const tx of transactions) {
        const amount = Math.abs(tx.amount);

        if (amount >= thresholds.roundNumberThreshold && amount % 1000 === 0) {
            alerts.push({
                type: 'ROUND_NUMBER',
                severity: 'low',
                transaction_id: tx.id,
                amount: tx.amount,
                description: tx.description,
                message: `Large round number transaction: $${amount.toFixed(2)}`
            });
        }
    }

    return alerts;
}

/**
 * Detect transactions at unusual times
 */
function detectUnusualTiming(transactions, baseline) {
    const alerts = [];

    for (const tx of transactions) {
        if (!tx.date) continue;

        const date = new Date(tx.date);
        const hour = date.getHours();
        const day = date.getDay();

        // Weekend transactions
        if (day === 0 || day === 6) {
            const amount = Math.abs(tx.amount);
            if (amount > 5000) {
                alerts.push({
                    type: 'WEEKEND_TRANSACTION',
                    severity: 'low',
                    transaction_id: tx.id,
                    amount: tx.amount,
                    description: tx.description,
                    message: `Large weekend transaction: $${amount.toFixed(2)}`
                });
            }
        }

        // After-hours transactions
        if (hour < 6 || hour > 22) {
            alerts.push({
                type: 'AFTER_HOURS',
                severity: 'low',
                transaction_id: tx.id,
                amount: tx.amount,
                description: tx.description,
                message: `Transaction at unusual hour: ${hour}:00`
            });
        }
    }

    return alerts;
}

/**
 * Detect unusual transaction velocity
 */
function detectVelocityAnomalies(transactions, baseline, thresholds) {
    const alerts = [];

    // Group by date
    const byDate = {};
    transactions.forEach(tx => {
        const date = tx.date?.split('T')[0] || 'unknown';
        byDate[date] = byDate[date] || [];
        byDate[date].push(tx);
    });

    for (const [date, txs] of Object.entries(byDate)) {
        if (txs.length > baseline.dailyAverage * thresholds.velocityMultiplier) {
            alerts.push({
                type: 'HIGH_VELOCITY',
                severity: 'medium',
                date,
                transaction_count: txs.length,
                details: {
                    daily_average: Math.round(baseline.dailyAverage),
                    multiplier: Math.round(txs.length / baseline.dailyAverage * 10) / 10
                },
                message: `Unusual number of transactions on ${date}: ${txs.length} (avg: ${Math.round(baseline.dailyAverage)})`
            });
        }
    }

    return alerts;
}

/**
 * Detect potential transaction structuring (split transactions)
 */
function detectSplitTransactions(transactions, thresholds) {
    const alerts = [];

    // Group by date and vendor
    const groups = {};
    transactions.forEach(tx => {
        const date = tx.date?.split('T')[0] || 'unknown';
        const vendor = (tx.vendor || tx.description || 'unknown').toLowerCase();
        const key = `${date}-${vendor}`;
        groups[key] = groups[key] || [];
        groups[key].push(tx);
    });

    for (const [key, txs] of Object.entries(groups)) {
        if (txs.length >= 2) {
            const total = txs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
            const allUnderThreshold = txs.every(tx => Math.abs(tx.amount) < thresholds.splitThreshold);

            // Multiple transactions that individually are under threshold but total over $10k
            if (allUnderThreshold && total > 10000) {
                alerts.push({
                    type: 'POTENTIAL_STRUCTURING',
                    severity: 'critical',
                    transaction_ids: txs.map(tx => tx.id),
                    total_amount: total,
                    details: {
                        transaction_count: txs.length,
                        individual_amounts: txs.map(tx => tx.amount)
                    },
                    message: `Potential structuring detected: ${txs.length} transactions totaling $${total.toFixed(2)} on same day to same vendor`
                });
            }
        }
    }

    return alerts;
}

/**
 * Calculate overall risk score (0-100)
 */
function calculateRiskScore(alerts) {
    const weights = {
        critical: 25,
        high: 15,
        medium: 8,
        low: 3
    };

    let score = 0;
    for (const alert of alerts) {
        score += weights[alert.severity] || 5;
    }

    return Math.min(100, score);
}

/**
 * Get risk level from score
 */
function getRiskLevel(score) {
    if (score >= 75) return 'CRITICAL';
    if (score >= 50) return 'HIGH';
    if (score >= 25) return 'MEDIUM';
    if (score >= 10) return 'LOW';
    return 'MINIMAL';
}

/**
 * Severity ordering for sorting
 */
function severityOrder(severity) {
    const order = { critical: 4, high: 3, medium: 2, low: 1 };
    return order[severity] || 0;
}

/**
 * Group array by key
 */
function groupBy(arr, key) {
    return arr.reduce((acc, item) => {
        const k = item[key];
        acc[k] = (acc[k] || 0) + 1;
        return acc;
    }, {});
}

/**
 * Generate recommendations based on findings
 */
function generateRecommendations(alerts, riskScore) {
    const recommendations = [];

    if (alerts.some(a => a.type === 'POTENTIAL_STRUCTURING')) {
        recommendations.push({
            priority: 'URGENT',
            action: 'Review potential structuring alerts immediately. May require SAR filing.',
            compliance: 'BSA/AML'
        });
    }

    if (alerts.filter(a => a.severity === 'high').length > 3) {
        recommendations.push({
            priority: 'HIGH',
            action: 'Multiple high-severity alerts detected. Schedule manual review.',
            compliance: 'Internal Controls'
        });
    }

    if (alerts.some(a => a.type === 'NEW_VENDOR')) {
        recommendations.push({
            priority: 'MEDIUM',
            action: 'Verify new vendor legitimacy before processing additional payments.',
            compliance: 'Vendor Management'
        });
    }

    if (riskScore < 25) {
        recommendations.push({
            priority: 'INFO',
            action: 'Risk level is acceptable. Continue routine monitoring.',
            compliance: 'Standard Practice'
        });
    }

    return recommendations;
}
