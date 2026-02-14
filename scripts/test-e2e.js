#!/usr/bin/env node
/**
 * Complete End-to-End Test of AI Vertical Platform
 * Tests the full workflow: Upload → Process → Chat → Skill Execution
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8000';

async function test() {
    console.log('🚀 Starting End-to-End Platform Test\\n');

    // STEP 1: Upload a document
    console.log('📤 STEP 1: Uploading test bank statement...');

    // Create test CSV file  
    const csvContent = `Date,Description,Amount,Category
2024-01-05,Office Depot - Supplies,-245.50,Office Supplies
2024-01-08,Starbucks - Client Meeting,-45.00,Meals
2024-01-10,AWS - Monthly Hosting,-189.00,Technology
2024-01-15,Apple Store - MacBook Pro,-2499.00,Equipment
2024-01-20,Legal Zoom - Business Filing,-399.00,Professional Services`;

    const testFile = '/tmp/test_bank_statement.csv';
    fs.writeFileSync(testFile, csvContent);

    const FormData = require('form-data');
    const form = new FormData();
    form.append('files', fs.createReadStream(testFile));
    form.append('document_type', 'bank_statement');

    const uploadResponse = await axios.post(`${BASE_URL}/api/v1/documents/upload`, form, {
        headers: form.getHeaders()
    });

    const docId = uploadResponse.data.documents[0].id;
    console.log(`✅ Document uploaded: ${docId}\\n`);

    // STEP 2: Process the document
    console.log('🔄 STEP 2: Processing document to extract data...');

    const processResponse = await axios.post(`${BASE_URL}/api/v1/documents/${docId}/process`);
    console.log(`✅ Document processed\\n`);
    console.log('Extracted data:', JSON.stringify(processResponse.data.extraction_result.extracted_data, null, 2));
    console.log('');

    // STEP 3: Fetch all documents
    console.log('📄 STEP 3: Fetching all uploaded documents...');

    const docsResponse = await axios.get(`${BASE_URL}/api/v1/documents?limit=50`);
    const documents = docsResponse.data.documents;
    console.log(`✅ Found ${documents.length} document(s)\\n`);

    // STEP 4: Test Chat with document context
    console.log('💬 STEP 4: Testing Chat with document context...');

    const chatResponse = await axios.post(`${BASE_URL}/api/v1/chat`, {
        message: "Categorize the expenses from my uploaded bank statement into tax categories",
        documents: documents.map(doc => ({
            id: doc.id,
            filename: doc.original_name || doc.filename,
            type: doc.document_type,
            processed: doc.processed,
            extracted_data: doc.extracted_data
        }))
    });

    console.log('\\n📊 CHAT RESPONSE:\\n');
    console.log(chatResponse.data.response);
    console.log('\\n');

    if (chatResponse.data.tool_results && chatResponse.data.tool_results.length > 0) {
        console.log('\\n🔧 TOOL RESULTS:\\n');
        chatResponse.data.tool_results.forEach((result, i) => {
            console.log(`Tool ${i + 1}: ${result.name}`);
            console.log(JSON.stringify(result.result, null, 2));
            console.log('');
        });
    }

    // STEP 5: Test direct skill call
    console.log('\\n⚙️  STEP 5: Testing direct skill call (tax-categorize)...');

    // Parse CSV to get transactions
    const lines = csvContent.split('\\n').slice(1); // Skip header
    const transactions = lines.map((line, i) => {
        const [date, description, amount, category] = line.split(',');
        return {
            id: `tx_${i + 1}`,
            date: date,
            description: description,
            amount: Math.abs(parseFloat(amount)),
            vendor: description.split(' - ')[0],
            category: category
        };
    });

    const skillResponse = await axios.post(`${BASE_URL}/api/v1/skills/tax-categorize`, {
        transactions: transactions,
        tax_year: 2024
    });

    console.log('\\n✅ TAX CATEGORIZATION RESULTS:\\n');
    console.log(JSON.stringify(skillResponse.data, null, 2));

    console.log('\\n\\n🎉 END-TO-END TEST COMPLETE!\\n');
    console.log('Summary:');
    console.log('- ✅ Document upload working');
    console.log('- ✅ Document processing working');
    console.log('- ✅ Document retrieval working');
    console.log('- ✅ Chat with document context working');
    console.log('- ✅ Direct skill execution working');
}

test().catch(err => {
    console.error('❌ TEST FAILED:', err.message);
    if (err.response) {
        console.error('Response data:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
});
