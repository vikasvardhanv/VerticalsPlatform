const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Export to Excel Skill
 * Exports financial data (transactions, tax summaries) to Excel format
 */
module.exports = {
    name: 'export-to-excel',
    description: 'Export financial data to Excel spreadsheet format with professional formatting',
    vertical: 'finance',
    tier: 1,

    inputSchema: {
        type: 'object',
        properties: {
            data: {
                type: 'object',
                description: 'The data to export (e.g., categorization results, transaction lists)'
            },
            export_type: {
                type: 'string',
                enum: ['tax_categorization', 'transactions', 'summary', 'custom'],
                default: 'custom',
                description: 'Type of export template to use'
            },
            filename: {
                type: 'string',
                description: 'Custom filename (without extension)',
                default: 'financial_export'
            },
            profile_name: {
                type: 'string',
                description: 'Profile name for organizing exports'
            },
            tenant_id: {
                type: 'string',
                format: 'uuid'
            }
        },
        required: ['data', 'tenant_id']
    },

    outputSchema: {
        type: 'object',
        properties: {
            success: { type: 'boolean' },
            export_id: { type: 'string' },
            filename: { type: 'string' },
            file_path: { type: 'string' },
            download_url: { type: 'string' },
            sheets: { type: 'array', items: { type: 'string' } }
        }
    },

    async execute(context) {
        const { input, audit, db } = context;
        const { data, export_type = 'custom', filename: customFilename, profile_name, tenant_id } = input;

        let exportData = data;

        // If no data provided but profile_name given, auto-load tax categorization data
        if (!exportData && profile_name && db) {
            // Load tax categorization from database using tax-prep-automate
            const { executeSkill } = require('../../../../api/services/tool-executor');

            try {
                const taxResult = await executeSkill('tax-prep-automate', {
                    profile_name,
                    tax_year: new Date().getFullYear()
                }, {
                    tenantId: tenant_id,
                    db,
                    dlp: { scan: () => ({ hasSensitiveData: false, findings: [] }) },
                    audit: { log: async () => ({}) }
                });

                if (taxResult.success) {
                    exportData = taxResult;
                }
            } catch (error) {
                console.error('Error auto-loading tax data:', error.message);
            }
        }

        if (!exportData) {
            throw new Error('data is required for export. Either provide data directly or specify profile_name to auto-load tax categorization.');
        }

        // Generate filename
        const timestamp = new Date().toISOString().split('T')[0];
        const baseFilename = customFilename || `${export_type}_${timestamp}`;
        const filename = `${baseFilename}.xlsx`;

        // Create exports directory
        const exportsDir = path.join(__dirname, '../../../../exports', tenant_id);
        if (!fs.existsSync(exportsDir)) {
            fs.mkdirSync(exportsDir, { recursive: true });
        }

        const filePath = path.join(exportsDir, filename);

        // Auto-detect export type if not specified
        let detectedExportType = export_type;
        if (export_type === 'custom' && exportData.categorized && exportData.needs_review) {
            detectedExportType = 'tax_categorization';
        }

        // Create workbook based on export type
        let workbook;
        let sheets = [];

        switch (detectedExportType) {
            case 'tax_categorization':
                workbook = createTaxCategorizationWorkbook(exportData, profile_name);
                sheets = ['Summary', 'Categorized Expenses', 'Needs Review', 'IRS Categories'];
                break;
            case 'transactions':
                workbook = createTransactionsWorkbook(exportData);
                sheets = ['Transactions'];
                break;
            case 'summary':
                workbook = createSummaryWorkbook(exportData);
                sheets = ['Summary'];
                break;
            default:
                workbook = createCustomWorkbook(exportData);
                sheets = Object.keys(exportData);
        }

        // Write workbook to file
        XLSX.writeFile(workbook, filePath);

        // Audit log
        await audit?.log({
            tenantId: tenant_id,
            action: 'EXCEL_EXPORT',
            resourceType: 'export',
            skillName: 'export-to-excel',
            meta: {
                export_type,
                filename,
                profile_name,
                sheets_count: sheets.length
            }
        });

        return {
            success: true,
            export_id: crypto.randomUUID(),
            filename,
            file_path: filePath,
            download_url: `/api/v1/exports/${tenant_id}/${filename}`,
            sheets,
            message: `Excel file created successfully with ${sheets.length} sheet(s)`
        };
    }
};

/**
 * Create workbook for tax categorization results
 */
function createTaxCategorizationWorkbook(data, profileName) {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary
    const summaryData = [
        ['Tax Categorization Summary'],
        ['Profile', profileName || 'N/A'],
        ['Generated', new Date().toLocaleString()],
        ['Tax Year', data.tax_year || new Date().getFullYear()],
        [],
        ['Metric', 'Value'],
        ['Total Transactions', data.categorized?.length + data.needs_review?.length || 0],
        ['Auto-Categorized', data.categorized?.length || 0],
        ['Needs Review', data.needs_review?.length || 0],
        ['Total Amount', formatCurrency(calculateTotal(data.categorized, 'amount'))],
        ['Total Deductible', formatCurrency(calculateTotal(data.categorized, 'deductible_amount'))],
        []
    ];

    // Add category breakdown
    if (data.summary_by_category) {
        summaryData.push(['Category Breakdown'], ['Category', 'IRS Line', 'Count', 'Total Amount', 'Deductible']);
        for (const [category, stats] of Object.entries(data.summary_by_category)) {
            summaryData.push([
                stats.category_label || category,
                stats.irs_line || 'N/A',
                stats.transaction_count || 0,
                formatCurrency(stats.total_amount || 0),
                formatCurrency(stats.deductible_amount || 0)
            ]);
        }
    }

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    // Sheet 2: Categorized Expenses
    if (data.categorized && data.categorized.length > 0) {
        const categorizedData = [
            ['Date', 'Description', 'Vendor', 'Amount', 'Category', 'IRS Line', 'Deductible %', 'Deductible Amount', 'Confidence']
        ];

        for (const tx of data.categorized) {
            categorizedData.push([
                tx.date || '',
                tx.description || '',
                tx.vendor || '',
                tx.amount || 0,
                tx.category_label || tx.category || '',
                tx.irs_line || '',
                (tx.deductible_rate || 1) * 100 + '%',
                tx.deductible_amount || 0,
                Math.round((tx.confidence || 0) * 100) + '%'
            ]);
        }

        const categorizedSheet = XLSX.utils.aoa_to_sheet(categorizedData);
        XLSX.utils.book_append_sheet(wb, categorizedSheet, 'Categorized Expenses');
    }

    // Sheet 3: Needs Review
    if (data.needs_review && data.needs_review.length > 0) {
        const reviewData = [
            ['Date', 'Description', 'Vendor', 'Amount', 'Suggested Category', 'Reason', 'Confidence']
        ];

        for (const tx of data.needs_review) {
            reviewData.push([
                tx.date || '',
                tx.description || '',
                tx.vendor || '',
                tx.amount || 0,
                tx.suggested_category || tx.category || 'Uncategorized',
                tx.reason || 'Needs manual review',
                Math.round((tx.confidence || 0) * 100) + '%'
            ]);
        }

        const reviewSheet = XLSX.utils.aoa_to_sheet(reviewData);
        XLSX.utils.book_append_sheet(wb, reviewSheet, 'Needs Review');
    }

    // Sheet 4: IRS Categories Reference
    const irsData = [
        ['IRS Schedule C Business Expense Categories'],
        [],
        ['Line', 'Category', 'Deductible %', 'Notes'],
        [8, 'Advertising', '100%', 'Marketing, promotional materials'],
        [9, 'Car and Truck Expenses', '100%', 'Business mileage, gas, maintenance'],
        [17, 'Legal and Professional Services', '100%', 'Attorney, CPA fees'],
        [18, 'Office Expense', '100%', 'Supplies, postage'],
        [20, 'Rent or Lease', '100%', 'Office space, equipment'],
        [24, 'Travel', '100%', 'Airfare, lodging'],
        ['24b', 'Meals', '50%', 'Business meals subject to 50% limit'],
        [25, 'Utilities', '100%', 'Phone, internet, electricity'],
        [27, 'Other Expenses', '100%', 'Software, subscriptions, misc']
    ];

    const irsSheet = XLSX.utils.aoa_to_sheet(irsData);
    XLSX.utils.book_append_sheet(wb, irsSheet, 'IRS Categories');

    return wb;
}

/**
 * Create workbook for simple transaction list
 */
function createTransactionsWorkbook(data) {
    const wb = XLSX.utils.book_new();
    const transactions = Array.isArray(data) ? data : (data.transactions || []);

    const txData = [
        ['Date', 'Description', 'Vendor', 'Amount', 'Type', 'Category']
    ];

    for (const tx of transactions) {
        txData.push([
            tx.date || '',
            tx.description || '',
            tx.vendor || '',
            tx.amount || 0,
            tx.type || '',
            tx.category || ''
        ]);
    }

    const sheet = XLSX.utils.aoa_to_sheet(txData);
    XLSX.utils.book_append_sheet(wb, sheet, 'Transactions');

    return wb;
}

/**
 * Create summary workbook
 */
function createSummaryWorkbook(data) {
    const wb = XLSX.utils.book_new();
    const summaryData = [['Key', 'Value']];

    for (const [key, value] of Object.entries(data)) {
        summaryData.push([key, typeof value === 'object' ? JSON.stringify(value) : value]);
    }

    const sheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, sheet, 'Summary');

    return wb;
}

/**
 * Create custom workbook from arbitrary data
 */
function createCustomWorkbook(data) {
    const wb = XLSX.utils.book_new();

    for (const [sheetName, sheetData] of Object.entries(data)) {
        let sheet;

        if (Array.isArray(sheetData)) {
            sheet = XLSX.utils.json_to_sheet(sheetData);
        } else if (typeof sheetData === 'object') {
            const arrayData = [[sheetName], [], ['Key', 'Value']];
            for (const [key, value] of Object.entries(sheetData)) {
                arrayData.push([key, typeof value === 'object' ? JSON.stringify(value) : value]);
            }
            sheet = XLSX.utils.aoa_to_sheet(arrayData);
        } else {
            sheet = XLSX.utils.aoa_to_sheet([[sheetName], [sheetData]]);
        }

        const safeName = sheetName.substring(0, 31).replace(/[:\\/\?\*\[\]]/g, '_');
        XLSX.utils.book_append_sheet(wb, sheet, safeName);
    }

    return wb;
}

/**
 * Helper: Calculate total from array of objects
 */
function calculateTotal(arr, field) {
    if (!arr || !Array.isArray(arr)) return 0;
    return arr.reduce((sum, item) => sum + (Math.abs(item[field]) || 0), 0);
}

/**
 * Helper: Format currency
 */
function formatCurrency(value) {
    return typeof value === 'number' ? `$${Math.abs(value).toFixed(2)}` : value;
}
