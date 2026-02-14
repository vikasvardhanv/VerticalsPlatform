/**
 * Finance Skills Test Suite
 * Tests for tax-prep-automate and doc-extract skills
 */

const { executeSkill } = require('../api/services/tool-executor');
const db = require('../core/database/connection');

const TENANT_ID = '00000000-0000-0000-0000-000000000002'; // FinSecure AI

describe('Finance Skills', () => {
  beforeAll(async () => {
    // Ensure database connection
    await db.testConnection();
  });

  afterAll(async () => {
    await db.close();
  });

  describe('tax-prep-automate', () => {
    test('should categorize transactions with detailed data', async () => {
      const transactions = [
        {
          date: '2025-01-15',
          description: 'Office supplies from Staples',
          vendor: 'Staples',
          amount: -45.99,
          type: 'debit'
        },
        {
          date: '2025-01-20',
          description: 'Google Ads marketing campaign',
          vendor: 'Google Ads',
          amount: -250.00,
          type: 'debit'
        },
        {
          date: '2025-02-05',
          description: 'Business lunch with client',
          vendor: 'Restaurant ABC',
          amount: -75.50,
          type: 'debit'
        },
        {
          date: '2025-02-10',
          description: 'Rent payment',
          vendor: 'Landlord LLC',
          amount: -1200.00,
          type: 'debit'
        },
        {
          date: '2025-03-01',
          description: 'Internet service',
          vendor: 'Comcast',
          amount: -89.99,
          type: 'debit'
        }
      ];

      const result = await executeSkill('tax-prep-automate', {
        transactions,
        tax_year: 2025,
        entity_type: 'individual',
        tenant_id: TENANT_ID
      }, {
        tenantId: TENANT_ID,
        vertical: 'finance',
        db
      });

      expect(result.success).toBe(true);
      expect(result.categorized.length).toBeGreaterThan(0);
      expect(result.totals.total_deductible).toBeGreaterThan(0);

      // Check that office supplies was categorized
      const officeExpense = result.categorized.find(t => t.vendor === 'Staples');
      expect(officeExpense).toBeDefined();
      expect(officeExpense.category).toBe('office_expense');

      // Check that meals has 50% deductibility
      const mealExpense = result.categorized.find(t => t.vendor === 'Restaurant ABC');
      expect(mealExpense).toBeDefined();
      expect(mealExpense.category).toBe('meals');
      expect(mealExpense.deductible_rate).toBe(0.5);
      expect(mealExpense.deductible_amount).toBe(75.50 * 0.5);

      console.log('Tax Prep Result:', JSON.stringify(result, null, 2));
    }, 15000);

    test('should load transactions from profile documents', async () => {
      const result = await executeSkill('tax-prep-automate', {
        profile_name: 'john',
        tax_year: 2025,
        entity_type: 'individual',
        tenant_id: TENANT_ID
      }, {
        tenantId: TENANT_ID,
        vertical: 'finance',
        db
      });

      expect(result.success).toBe(true);
      expect(result.categorized.length).toBeGreaterThan(0);
      expect(result.summary_by_category).toBeDefined();

      console.log('Profile-based Tax Prep:');
      console.log('- Transactions:', result.totals.transactions);
      console.log('- Categorized:', result.totals.categorized);
      console.log('- Needs Review:', result.totals.needs_review);
      console.log('- Total Deductible:', result.totals.total_deductible);
    }, 15000);

    test('should skip summary transactions', async () => {
      const transactions = [
        {
          id: 'summary1',
          date: '2025-12-31',
          description: 'Total deposits - December 2025',
          amount: 4200,
          type: 'credit'
        },
        {
          id: 'summary2',
          date: '2025-12-31',
          description: 'Total withdrawals - December 2025',
          amount: -3870,
          type: 'debit'
        },
        {
          id: 'real1',
          date: '2025-12-05',
          description: 'Office supplies',
          vendor: 'Staples',
          amount: -45.99,
          type: 'debit'
        }
      ];

      const result = await executeSkill('tax-prep-automate', {
        transactions,
        tax_year: 2025,
        entity_type: 'individual',
        tenant_id: TENANT_ID
      }, {
        tenantId: TENANT_ID,
        vertical: 'finance',
        db
      });

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings.length).toBe(2); // Two summary transactions skipped
      expect(result.categorized.length).toBe(1); // Only the real transaction
    }, 15000);
  });

  describe('doc-extract', () => {
    test('should extract data from profile documents', async () => {
      const result = await executeSkill('doc-extract', {
        profile_name: 'john',
        tenant_id: TENANT_ID
      }, {
        tenantId: TENANT_ID,
        vertical: 'finance',
        db
      });

      expect(result.success).toBe(true);
      expect(result.documents_processed).toBeGreaterThan(0);
      expect(result.extracted_data).toBeDefined();
      expect(Array.isArray(result.extracted_data)).toBe(true);

      console.log('Doc Extract Result:');
      console.log('- Documents processed:', result.documents_processed);
      console.log('- Extracted data count:', result.extracted_data.length);

      // Check that at least one document has transactions
      const docWithTransactions = result.extracted_data.find(d =>
        d.data && d.data.transactions && d.data.transactions.length > 0
      );
      expect(docWithTransactions).toBeDefined();

      if (docWithTransactions) {
        console.log('- Sample document:', docWithTransactions.filename);
        console.log('- Transactions in sample:', docWithTransactions.data.transactions.length);
      }
    }, 15000);
  });

  describe('End-to-End Tax Filing Workflow', () => {
    test('should complete full tax preparation workflow for a profile', async () => {
      console.log('\n=== Starting Tax Filing Workflow for John ===\n');

      // Step 1: Extract document data
      console.log('Step 1: Extracting transaction data from documents...');
      const extractResult = await executeSkill('doc-extract', {
        profile_name: 'john',
        tenant_id: TENANT_ID
      }, {
        tenantId: TENANT_ID,
        vertical: 'finance',
        db
      });

      expect(extractResult.success).toBe(true);
      console.log(`✓ Extracted data from ${extractResult.documents_processed} documents`);

      // Step 2: Categorize for tax prep
      console.log('\nStep 2: Categorizing transactions for tax preparation...');
      const taxResult = await executeSkill('tax-prep-automate', {
        profile_name: 'john',
        tax_year: 2025,
        entity_type: 'individual',
        tenant_id: TENANT_ID
      }, {
        tenantId: TENANT_ID,
        vertical: 'finance',
        db
      });

      expect(taxResult.success).toBe(true);
      console.log(`✓ Categorized ${taxResult.totals.categorized} transactions`);
      console.log(`✓ ${taxResult.totals.needs_review} transactions need review`);
      console.log(`✓ Total deductible expenses: $${taxResult.totals.total_deductible}`);

      // Step 3: Verify categories
      console.log('\nStep 3: Reviewing categorized expenses...');
      console.log('\nExpense Summary by Category:');
      for (const [category, data] of Object.entries(taxResult.summary_by_category)) {
        console.log(`  ${data.category_label}:`);
        console.log(`    - ${data.count} transaction(s)`);
        console.log(`    - Total: $${data.total.toFixed(2)}`);
        console.log(`    - Deductible: $${data.deductible.toFixed(2)}`);
        console.log(`    - IRS Schedule C Line: ${data.irs_line}`);
      }

      // Verify we have common categories
      expect(Object.keys(taxResult.summary_by_category).length).toBeGreaterThan(0);

      console.log('\n=== Tax Filing Workflow Complete ===\n');
    }, 30000);
  });
});
