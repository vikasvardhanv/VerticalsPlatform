/**
 * Document Extract Skill
 * Extracts structured financial data from documents
 * Currently uses Claude's vision API for PDF/image analysis
 */

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

module.exports = {
  name: 'doc-extract',
  description: 'Extract structured financial data from uploaded documents (receipts, invoices, bank statements, W-2, 1099)',
  vertical: 'finance',
  tier: 1,

  inputSchema: {
    type: 'object',
    properties: {
      document_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of document IDs to extract data from'
      },
      profile_name: {
        type: 'string',
        description: 'Profile name to filter documents'
      },
      tenant_id: {
        type: 'string',
        format: 'uuid'
      }
    },
    required: ['tenant_id']
  },

  async execute(context) {
    const { input, db, audit } = context;
    const { document_ids, profile_name, tenant_id } = input;

    if (!document_ids && !profile_name) {
      throw new Error('Either document_ids or profile_name must be provided');
    }

    // Query documents from database
    let query, params;
    if (document_ids) {
      query = `
        SELECT id, filename, original_name, mimetype, file_path, document_type, extracted_data
        FROM documents
        WHERE tenant_id = $1 AND id = ANY($2) AND deleted_at IS NULL
      `;
      params = [tenant_id, document_ids];
    } else {
      query = `
        SELECT id, filename, original_name, mimetype, file_path, document_type, extracted_data
        FROM documents
        WHERE tenant_id = $1 AND profile_name = $2 AND deleted_at IS NULL
        ORDER BY created_at DESC
      `;
      params = [tenant_id, profile_name];
    }

    const result = await db.query(query, params);
    const documents = result.rows;

    if (documents.length === 0) {
      return {
        success: false,
        error: 'No documents found matching the criteria'
      };
    }

    const extractedData = [];
    const errors = [];

    // Initialize Anthropic client if available
    const anthropic = process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : null;

    for (const doc of documents) {
      try {
        // If already extracted and has transactions, use that
        if (doc.extracted_data && typeof doc.extracted_data === 'object') {
          const data = doc.extracted_data;

          // Check if we need to enhance the data with transaction details
          const needsEnhancement = !data.transactions || data.transactions.length === 0;

          if (!needsEnhancement) {
            extractedData.push({
              document_id: doc.id,
              filename: doc.original_name,
              data: doc.extracted_data
            });
            continue;
          }
        }

        // For documents that need AI extraction (no detailed transactions yet)
        if (anthropic && doc.file_path) {
          const extracted = await extractWithAI(anthropic, doc);

          // Update database with extracted data
          await db.query(`
            UPDATE documents
            SET extracted_data = $1, status = 'processed', processed_at = NOW()
            WHERE id = $2
          `, [JSON.stringify(extracted), doc.id]);

          extractedData.push({
            document_id: doc.id,
            filename: doc.original_name,
            data: extracted
          });
        } else {
          // No AI available or no file path
          extractedData.push({
            document_id: doc.id,
            filename: doc.original_name,
            data: doc.extracted_data || {},
            warning: 'Document may need manual review - AI extraction not available'
          });
        }
      } catch (error) {
        errors.push({
          document_id: doc.id,
          filename: doc.original_name,
          error: error.message
        });
      }
    }

    await audit?.log({
      tenantId: tenant_id,
      action: 'DOC_EXTRACT',
      resourceType: 'documents',
      skillName: 'doc-extract',
      meta: {
        documents_processed: documents.length,
        successful: extractedData.length,
        errors: errors.length
      }
    });

    return {
      success: true,
      documents_processed: documents.length,
      extracted_data: extractedData,
      errors: errors.length > 0 ? errors : undefined
    };
  }
};

/**
 * Extract data from document using Claude Vision API
 */
async function extractWithAI(anthropic, document) {
  const filePath = document.file_path;

  // Check if file exists
  const fullPath = path.join(process.cwd(), 'platform', filePath);

  try {
    await fs.access(fullPath);
  } catch (error) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Read file and convert to base64
  const fileBuffer = await fs.readFile(fullPath);
  const base64Data = fileBuffer.toString('base64');

  // Determine media type
  let mediaType = 'application/pdf';
  if (document.mimetype) {
    mediaType = document.mimetype;
  }

  // Create extraction prompt
  const extractionPrompt = `You are a financial document extraction expert. Analyze this document and extract ALL relevant financial data.

CRITICAL REQUIREMENTS:
1. Identify the document type (bank statement, invoice, receipt, W-2, 1099, credit card statement, etc.)
2. Extract INDIVIDUAL TRANSACTIONS if this is a transactional document (bank statement, credit card statement, expense report)
3. For each transaction, extract: date, description, vendor/payee, amount, category (if listed)
4. Extract summary totals (total income, total expenses, balances)
5. Extract tax-relevant information (EIN, SSN if W-2/1099, tax categories)
6. Extract dates (statement period, due dates, payment dates)

For BANK STATEMENTS specifically:
- Extract EVERY individual transaction listed
- Do NOT just provide summary totals
- Each transaction should have: date, description, amount (negative for withdrawals/debits, positive for deposits/credits)

Output format:
{
  "document_type": "Bank Statement" | "Invoice" | "Receipt" | "W-2" | "1099-MISC" | etc,
  "date_range": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "account_holder": "Name",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "Vendor or description",
      "vendor": "Vendor name if identifiable",
      "amount": -123.45,
      "type": "debit" | "credit",
      "category": "category if listed"
    }
  ],
  "summary": {
    "total_deposits": 1000,
    "total_withdrawals": 500,
    "starting_balance": 1000,
    "ending_balance": 1500
  },
  "tax_info": {
    // W-2/1099 specific fields, invoice vendor info, etc
  }
}

IMPORTANT: Return ONLY valid JSON, no markdown, no explanation.`;

  // Call Claude with vision
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: base64Data
          }
        },
        {
          type: 'text',
          text: extractionPrompt
        }
      ]
    }]
  });

  // Parse response
  const textContent = response.content.find(block => block.type === 'text')?.text || '{}';

  // Extract JSON from response (in case Claude wrapped it in markdown)
  let jsonText = textContent.trim();
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/```json\n?/, '').replace(/\n?```$/, '');
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/```\n?/, '').replace(/\n?```$/, '');
  }

  const extracted = JSON.parse(jsonText);

  return extracted;
}
