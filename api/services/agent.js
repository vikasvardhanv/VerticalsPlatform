/**
 * Multi-Provider AI Agent Service
 * Supports Claude (Anthropic) and GPT-4 (OpenAI) with automatic fallback
 */

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { executeSkill, getAvailableTools } = require('./tool-executor');

// Initialize clients (lazy loading)
let anthropicClient = null;
let openaiClient = null;

function getAnthropicClient() {
    if (!anthropicClient && process.env.ANTHROPIC_API_KEY) {
        anthropicClient = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY
        });
    }
    return anthropicClient;
}

function getOpenAIClient() {
    if (!openaiClient && process.env.OPENAI_API_KEY) {
        openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }
    return openaiClient;
}

/**
 * Get available providers
 */
function getAvailableProviders() {
    const providers = [];
    if (process.env.ANTHROPIC_API_KEY) providers.push('anthropic');
    if (process.env.OPENAI_API_KEY) providers.push('openai');
    return providers;
}

/**
 * System prompt for the finance AI agent
 */
const SYSTEM_PROMPT = `You are FinSecure AI, an expert financial assistant designed specifically for CPAs, tax preparers, and accounting professionals.

## Your Primary Workflows

### Tax Preparation Workflow (Most Common)
1. **Extract transaction data**: Use doc-extract skill to extract detailed transactions from uploaded bank statements, receipts, invoices
2. **Categorize for taxes**: Use tax-prep-automate skill to categorize expenses into IRS Schedule C categories
3. **Review and adjust**: Help identify transactions needing manual review
4. **Generate summaries**: Provide clear tax preparation summaries

### Document Processing
- Extract data from W-2, 1099, receipts, invoices, bank statements
- Identify document types automatically
- Parse all relevant tax information

### Compliance & Security
- PCI/PII redaction from financial documents
- SOX compliance checking
- Audit trail generation

## Available Tools & When to Use Them

**doc-extract**: Use when user uploads documents or asks to "extract", "read", "parse", or "analyze" documents
- Automatically extracts individual transactions from bank statements
- Parses W-2, 1099, receipts, invoices
- Call with profile_name to process all documents for a client

**tax-prep-automate**: Use when user asks to "categorize expenses", "prepare taxes", "classify transactions", or "tax filing"
- Automatically loads transactions from documents if profile_name provided
- Categorizes into IRS Schedule C categories
- Identifies deductible vs non-deductible expenses
- Flags transactions needing manual review

**pci-redact**: Use when handling sensitive payment card or financial data that needs redaction

**bank-recon-sync**: Use for bank reconciliation tasks
- Can show bank transaction summary with just profile_name
- For full reconciliation, requires both bank_transactions AND ledger_entries
- If user only has bank data, explain ledger data is needed for reconciliation

**audit-trail-generate**: Use when generating audit documentation

**export-to-excel**: Use to export financial data to Excel spreadsheets
- Can be called with just profile_name - will auto-load latest tax categorization
- Or provide full data object for custom exports
- Automatically creates professional multi-sheet Excel workbooks
- Returns download_url for the user to download the file
- Always call this when user asks to "export" or wants Excel format

## Critical Workflow Understanding

When a user says "start tax filing for [name]" or "categorize expenses for [name]":
1. FIRST: Check if documents have detailed transaction data using doc-extract
2. THEN: Run tax-prep-automate with the profile_name
3. PRESENT: Format results in markdown tables (see formatting rules below)
4. OFFER: Suggest Excel export for full detailed workbook

## Response Formatting Rules

**ALWAYS use markdown tables for financial data:**

1. **Tax Categorization Results** - Use this format:
   \`\`\`
   ### 📊 Categorized Expenses

   | Category | IRS Line | Count | Total | Deductible | Rate |
   |----------|----------|-------|-------|------------|------|
   | Office Expense | 18 | 2 | $150.00 | $150.00 | 100% |
   | Meals | 24 | 3 | $250.00 | $125.00 | 50% |

   ### ⚠️ Needs Review

   | Date | Description | Vendor | Amount | Reason |
   |------|-------------|--------|--------|--------|
   | 2026-01-15 | Course | Coursera | $199.00 | No category match |
   \`\`\`

2. **Summary Totals** - Always include:
   \`\`\`
   ### 💰 Summary

   | Metric | Value |
   |--------|-------|
   | Total Transactions | 19 |
   | Auto-Categorized | 15 |
   | Needs Review | 4 |
   | Total Expenses | $3,245.50 |
   | Total Deductible | $2,890.25 |
   \`\`\`

3. **After showing tables, ALWAYS offer Excel export:**
   "Would you like me to export this to Excel? I can create a detailed workbook with multiple sheets for easier analysis and record-keeping."

## Important Guidelines

1. **Be proactive with tools**: Don't ask for tenant_id or data that's already available in documents
2. **Financial accuracy**: Double-check all calculations and amounts
3. **Clear summaries**: CPAs need actionable insights in TABLE FORMAT, not prose
4. **Compliance first**: Flag any tax compliance or regulatory concerns
5. **Privacy**: Never expose SSNs, account numbers, or card numbers in responses
6. **Helpful guidance**: If data is missing or incomplete, explain what's needed and why
7. **Excel exports**: Always offer Excel export after presenting financial results

## Communication Style

- Professional but conversational
- **ALWAYS use markdown tables** for financial data
- Use financial/accounting terminology appropriately
- Provide context for tax rules (e.g., "meals are 50% deductible")
- Give next steps and recommendations
- Be transparent about confidence levels and what needs manual review
- Offer Excel export for detailed analysis

Remember: Your goal is to save CPAs time while maintaining accuracy and compliance. Use tables for clarity and offer Excel exports for deeper analysis.`;

/**
 * Main agent execution function
 * @param {Object} options
 * @param {string} options.message - User message
 * @param {string} options.tenantId - Tenant ID for multi-tenancy
 * @param {string} options.userId - User ID
 * @param {Array} options.conversationHistory - Previous messages
 * @param {Object} options.context - Additional context (dlp, audit, db)
 */
async function runAgent(options) {
    const {
        message,
        tenantId,
        userId,
        conversationHistory = [],
        context = {}
    } = options;

    const providers = getAvailableProviders();
    if (providers.length === 0) {
        throw new Error('No AI providers configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.');
    }

    // Get available tools for this tenant
    const tools = getAvailableTools('finance');

    // Try primary provider first, fallback to secondary
    let lastError = null;

    for (const provider of providers) {
        try {
            const result = await executeWithProvider(provider, {
                message,
                tenantId,
                userId,
                conversationHistory,
                context,
                tools
            });
            return result;
        } catch (error) {
            console.error(`Provider ${provider} failed:`, error.message);
            lastError = error;
            // Continue to next provider
        }
    }

    throw new Error(`All providers failed. Last error: ${lastError?.message}`);
}

/**
 * Execute with a specific provider
 */
async function executeWithProvider(provider, options) {
    if (provider === 'anthropic') {
        return executeWithAnthropic(options);
    } else if (provider === 'openai') {
        return executeWithOpenAI(options);
    }
    throw new Error(`Unknown provider: ${provider}`);
}

/**
 * Execute with Anthropic Claude
 */
async function executeWithAnthropic(options) {
    const { message, tenantId, conversationHistory, context, tools } = options;
    const client = getAnthropicClient();

    if (!client) {
        throw new Error('Anthropic client not available');
    }

    // Convert tools to Anthropic format
    const anthropicTools = tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema
    }));

    // Build enhanced system message with document context
    let systemMessage = SYSTEM_PROMPT;

    if (context.documents && context.documents.length > 0) {
        // Check for both camelCase (from DB) and snake_case (legacy) field names
        const processedDocs = context.documents.filter(d => {
            const extractedData = d.extractedData || d.extracted_data;
            return (d.status === 'processed' || d.processed) && extractedData;
        });

        if (processedDocs.length > 0) {
            systemMessage += `\n\n## Available Documents\n\nThe user has uploaded ${processedDocs.length} document(s) that you can use:\n\n`;

            processedDocs.forEach((doc, i) => {
                const extractedData = doc.extractedData || doc.extracted_data;
                const filename = doc.originalName || doc.filename;
                const docType = doc.documentType || doc.type || 'unknown';

                systemMessage += `${i + 1}. **${filename}** (Type: ${docType})\n`;

                // Parse extracted data if it's a string
                let parsedData = extractedData;
                if (typeof extractedData === 'string') {
                    try {
                        parsedData = JSON.parse(extractedData);
                    } catch (e) {
                        parsedData = extractedData;
                    }
                }

                if (parsedData && parsedData.transactions) {
                    systemMessage += `   - Contains ${parsedData.transactions.length} transaction(s)\n`;
                    systemMessage += `   - Data: ${JSON.stringify(parsedData.transactions, null, 2)}\n\n`;
                } else if (typeof parsedData === 'object') {
                    systemMessage += `   - Extracted Data: ${JSON.stringify(parsedData, null, 2)}\n\n`;
                }
            });

            systemMessage += `\n**IMPORTANT**: When the user asks you to categorize expenses, reconcile accounts, detect anomalies, or perform any financial operation:
1. DO NOT include "tenant_id" in your tool calls - it's automatically provided by the system
2. Use the exact profile_name from the context (current profile: "${context.profile_name}")
3. Use transaction data from the documents shown above - don't ask the user for it
4. Call the appropriate financial tools directly with the correct profile_name`;
        }
    }

    // Build messages
    const messages = [
        ...conversationHistory.map(msg => ({
            role: msg.role,
            content: msg.content
        })),
        { role: 'user', content: message }
    ];

    // Initial API call
    let response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemMessage,
        tools: anthropicTools,
        messages
    });

    // Handle tool calls iteratively
    const toolResults = [];
    let iterations = 0;
    const maxIterations = 10;

    while (response.stop_reason === 'tool_use' && iterations < maxIterations) {
        iterations++;

        // Extract tool use blocks
        const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');

        // Execute each tool
        const toolResultsForThisRound = [];
        for (const toolUse of toolUseBlocks) {
            if (!toolUse || !toolUse.id || !toolUse.name) {
                console.error('Invalid tool use block:', toolUse);
                continue;
            }

            const result = await executeSkill(toolUse.name, toolUse.input, {
                tenantId,
                ...context
            });

            toolResults.push({
                tool: toolUse.name,
                input: toolUse.input,
                output: result
            });

            toolResultsForThisRound.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify(result)
            });
        }

        // Continue conversation with tool results
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResultsForThisRound });

        response = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools: anthropicTools,
            messages
        });
    }

    // Extract final text response
    const textBlocks = response.content.filter(block => block.type === 'text');
    const finalResponse = textBlocks.map(block => block.text).join('\n');

    return {
        success: true,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        response: finalResponse,
        toolResults,
        usage: {
            input_tokens: response.usage?.input_tokens,
            output_tokens: response.usage?.output_tokens
        }
    };
}

/**
 * Execute with OpenAI GPT-4
 */
async function executeWithOpenAI(options) {
    const { message, tenantId, conversationHistory, context, tools } = options;
    const client = getOpenAIClient();

    if (!client) {
        throw new Error('OpenAI client not available');
    }

    // Convert tools to OpenAI format
    const openaiTools = tools.map(tool => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
        }
    }));

    // Build enhanced system message with document context (same as Anthropic)
    let systemMessage = SYSTEM_PROMPT;

    if (context.documents && context.documents.length > 0) {
        const processedDocs = context.documents.filter(d => {
            const extractedData = d.extractedData || d.extracted_data;
            return (d.status === 'processed' || d.processed) && extractedData;
        });

        if (processedDocs.length > 0) {
            systemMessage += `\n\n## Available Documents\n\nThe user has uploaded ${processedDocs.length} document(s) that you can use:\n\n`;

            processedDocs.forEach((doc, i) => {
                const extractedData = doc.extractedData || doc.extracted_data;
                const filename = doc.originalName || doc.filename;
                const docType = doc.documentType || doc.type || 'unknown';

                systemMessage += `${i + 1}. **${filename}** (Type: ${docType})\n`;

                let parsedData = extractedData;
                if (typeof extractedData === 'string') {
                    try {
                        parsedData = JSON.parse(extractedData);
                    } catch (e) {
                        parsedData = extractedData;
                    }
                }

                if (parsedData && parsedData.transactions) {
                    systemMessage += `   - Contains ${parsedData.transactions.length} transaction(s)\n`;
                    systemMessage += `   - Data: ${JSON.stringify(parsedData.transactions, null, 2)}\n\n`;
                } else if (typeof parsedData === 'object') {
                    systemMessage += `   - Extracted Data: ${JSON.stringify(parsedData, null, 2)}\n\n`;
                }
            });

            systemMessage += `\n**IMPORTANT**: When the user asks you to categorize expenses, reconcile accounts, detect anomalies, or perform any financial operation:
1. DO NOT include "tenant_id" in your tool calls - it's automatically provided by the system
2. Use the exact profile_name from the context (current profile: "${context.profile_name}")
3. Use transaction data from the documents shown above - don't ask the user for it
4. Call the appropriate financial tools directly with the correct profile_name`;
        }
    }

    // Build messages
    const messages = [
        { role: 'system', content: systemMessage },
        ...conversationHistory.map(msg => ({
            role: msg.role,
            content: msg.content
        })),
        { role: 'user', content: message }
    ];

    // Initial API call
    let response = await client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 4096,
        tools: openaiTools,
        messages
    });

    // Handle tool calls iteratively
    const toolResults = [];
    let iterations = 0;
    const maxIterations = 10;

    while (response.choices[0]?.finish_reason === 'tool_calls' && iterations < maxIterations) {
        iterations++;

        const assistantMessage = response.choices[0].message;
        messages.push(assistantMessage);

        // Execute each tool call
        for (const toolCall of assistantMessage.tool_calls || []) {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await executeSkill(toolCall.function.name, args, {
                tenantId,
                ...context
            });

            toolResults.push({
                tool: toolCall.function.name,
                input: args,
                output: result
            });

            messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(result)
            });
        }

        // Continue conversation
        response = await client.chat.completions.create({
            model: 'gpt-4o',
            max_tokens: 4096,
            tools: openaiTools,
            messages
        });
    }

    const finalResponse = response.choices[0]?.message?.content || '';

    return {
        success: true,
        provider: 'openai',
        model: 'gpt-4o',
        response: finalResponse,
        toolResults,
        usage: {
            input_tokens: response.usage?.prompt_tokens,
            output_tokens: response.usage?.completion_tokens
        }
    };
}

/**
 * Stream agent response (for real-time UI updates)
 */
async function runAgentStream(options, onChunk) {
    // For MVP, we'll use non-streaming and simulate chunks
    // Full streaming can be added later
    const result = await runAgent(options);

    // Simulate streaming by chunking the response
    const words = result.response.split(' ');
    for (let i = 0; i < words.length; i += 3) {
        const chunk = words.slice(i, i + 3).join(' ') + ' ';
        onChunk({ type: 'text', content: chunk });
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    onChunk({ type: 'done', toolResults: result.toolResults });
    return result;
}

module.exports = {
    runAgent,
    runAgentStream,
    getAvailableProviders,
    SYSTEM_PROMPT
};
