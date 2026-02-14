const crypto = require('crypto');

module.exports = {
  name: 'invoice-parse-validate',
  description: 'Parse and validate invoices against purchase orders',
  vertical: 'finance',
  tier: 1,

  inputSchema: {
    type: 'object',
    properties: {
      invoice: { type: 'object' },
      purchase_order: { type: 'object' },
      tolerance_percent: { type: 'number', default: 0.02 },
      tenant_id: { type: 'string' }
    },
    required: ['invoice', 'tenant_id']
  },

  async execute(context) {
    const { input, audit } = context;
    const { invoice, purchase_order, tolerance_percent = 0.02, tenant_id } = input;

    const validationResults = [];
    let overallValid = true;

    // Parse invoice fields
    const parsed = {
      invoice_number: invoice.number || invoice.invoice_number,
      vendor: invoice.vendor || invoice.from,
      date: invoice.date,
      due_date: invoice.due_date,
      line_items: invoice.items || invoice.line_items || [],
      subtotal: invoice.subtotal || 0,
      tax: invoice.tax || 0,
      total: invoice.total || 0
    };

    // Validate required fields
    const requiredFields = ['invoice_number', 'vendor', 'date', 'total'];
    for (const field of requiredFields) {
      if (!parsed[field]) {
        validationResults.push({ field, valid: false, error: `Missing required field: ${field}` });
        overallValid = false;
      }
    }

    // Validate math
    const calculatedSubtotal = parsed.line_items.reduce((s, item) =>
      s + (item.quantity || 1) * (item.unit_price || item.price || 0), 0);
    const calculatedTotal = calculatedSubtotal + parsed.tax;

    if (Math.abs(calculatedSubtotal - parsed.subtotal) > 0.01) {
      validationResults.push({
        field: 'subtotal',
        valid: false,
        error: `Subtotal mismatch: stated ${parsed.subtotal}, calculated ${calculatedSubtotal}`
      });
      overallValid = false;
    }

    if (Math.abs(calculatedTotal - parsed.total) > 0.01) {
      validationResults.push({
        field: 'total',
        valid: false,
        error: `Total mismatch: stated ${parsed.total}, calculated ${calculatedTotal}`
      });
      overallValid = false;
    }

    // Three-way match with PO if provided
    let poMatch = null;
    if (purchase_order) {
      const poTotal = purchase_order.total || 0;
      const tolerance = poTotal * tolerance_percent;
      const diff = Math.abs(parsed.total - poTotal);

      poMatch = {
        po_number: purchase_order.number || purchase_order.po_number,
        po_total: poTotal,
        invoice_total: parsed.total,
        difference: diff,
        within_tolerance: diff <= tolerance,
        vendor_match: (parsed.vendor || '').toLowerCase() === (purchase_order.vendor || '').toLowerCase()
      };

      if (!poMatch.within_tolerance) {
        validationResults.push({
          field: 'po_match',
          valid: false,
          error: `Invoice total ${parsed.total} differs from PO ${poTotal} by ${diff} (tolerance: ${tolerance})`
        });
        overallValid = false;
      }

      if (!poMatch.vendor_match) {
        validationResults.push({
          field: 'vendor',
          valid: false,
          error: `Vendor mismatch: invoice "${parsed.vendor}" vs PO "${purchase_order.vendor}"`
        });
        overallValid = false;
      }
    }

    await audit?.log({
      tenantId: tenant_id,
      action: 'INVOICE_VALIDATION',
      resourceType: 'invoice',
      skillName: 'invoice-parse-validate',
      meta: { invoice_number: parsed.invoice_number, valid: overallValid }
    });

    return {
      success: true,
      validation_id: crypto.randomUUID(),
      parsed_invoice: parsed,
      validation_results: validationResults,
      po_match: poMatch,
      overall_valid: overallValid,
      recommendation: overallValid ? 'APPROVE' : 'REVIEW_REQUIRED',
      summary: {
        invoice_number: parsed.invoice_number,
        vendor: parsed.vendor,
        total: parsed.total,
        line_items_count: parsed.line_items.length,
        errors_count: validationResults.filter(v => !v.valid).length
      }
    };
  }
};
