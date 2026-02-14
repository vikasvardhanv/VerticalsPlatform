/**
 * Chat API Routes
 * Handles AI chat interactions for CPAs
 */

const express = require('express');
const router = express.Router();
const { runAgent, runAgentStream, getAvailableProviders } = require('../services/agent');
const { getAvailableTools } = require('../services/tool-executor');

// In-memory conversation store (use Redis/DB in production)
const conversationStore = new Map();

/**
 * POST /api/v1/chat
 * Send a message to the AI agent (with profile support)
 */
router.post('/', async (req, res) => {
    try {
        const { message, conversation_id, stream = false, profile_name } = req.body;
        const tenantId = req.tenantId;
        const userId = req.userId || null;

        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Message is required and must be a string'
            });
        }

        // Fetch documents for this profile from database
        let documents = [];
        if (profile_name) {
            const docResult = await req.db.query(`
                SELECT id, filename, original_name as "originalName", mimetype,
                       document_type as "documentType", status,
                       extracted_data as "extractedData"
                FROM documents
                WHERE tenant_id = $1 AND profile_name = $2 AND deleted_at IS NULL
                ORDER BY created_at DESC
            `, [tenantId, profile_name]);

            documents = docResult.rows;
        }

        // Get or create conversation history
        const convId = conversation_id || generateConversationId();
        const history = conversationStore.get(convId) || [];

        // Build context from request
        const context = {
            dlp: req.dlp,
            audit: req.audit,
            db: req.db,
            vertical: 'finance',
            profile_name,
            documents  // Documents from DB for this profile
        };

        if (stream) {
            // Streaming response
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            await runAgentStream(
                { message, tenantId, userId, conversationHistory: history, context },
                (chunk) => {
                    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                }
            );

            res.write('data: [DONE]\n\n');
            res.end();
        } else {
            // Regular response
            const result = await runAgent({
                message,
                tenantId,
                userId,
                conversationHistory: history,
                context
            });

            // Update conversation history
            history.push({ role: 'user', content: message });
            history.push({ role: 'assistant', content: result.response });

            // Keep last 20 messages
            if (history.length > 20) {
                history.splice(0, history.length - 20);
            }
            conversationStore.set(convId, history);

            res.json({
                success: true,
                conversation_id: convId,
                response: result.response,
                tool_results: result.toolResults,
                provider: result.provider,
                model: result.model,
                usage: result.usage
            });
        }
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'An error occurred processing your request'
        });
    }
});

/**
 * GET /api/v1/chat/conversations/:id
 * Get conversation history
 */
router.get('/conversations/:id', (req, res) => {
    const { id } = req.params;
    const history = conversationStore.get(id);

    if (!history) {
        return res.status(404).json({
            success: false,
            error: 'Conversation not found'
        });
    }

    res.json({
        success: true,
        conversation_id: id,
        messages: history
    });
});

/**
 * DELETE /api/v1/chat/conversations/:id
 * Clear conversation history
 */
router.delete('/conversations/:id', (req, res) => {
    const { id } = req.params;
    conversationStore.delete(id);

    res.json({
        success: true,
        message: 'Conversation cleared'
    });
});

/**
 * GET /api/v1/chat/tools
 * List available tools/skills
 */
router.get('/tools', (req, res) => {
    const tools = getAvailableTools('finance');

    res.json({
        success: true,
        tools: tools.map(t => ({
            name: t.name,
            description: t.description
        }))
    });
});

/**
 * GET /api/v1/chat/providers
 * List available AI providers
 */
router.get('/providers', (req, res) => {
    const providers = getAvailableProviders();

    res.json({
        success: true,
        providers,
        primary: providers[0] || null
    });
});

/**
 * Generate a unique conversation ID
 */
function generateConversationId() {
    return 'conv_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

module.exports = router;
