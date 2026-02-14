/**
 * Tool Executor Service
 * Loads and executes skills as tools for the AI agent
 */

const path = require('path');
const fs = require('fs');

// Cache for loaded skills
const skillCache = new Map();

/**
 * Get the skills directory for a vertical
 */
function getSkillsDir(vertical) {
    return path.join(__dirname, '../../verticals', vertical, 'skills');
}

/**
 * Load a skill module
 * Supports both folder structure (skill/execute.js) and flat file (skill.js)
 */
function loadSkill(vertical, skillName) {
    const cacheKey = `${vertical}:${skillName}`;

    if (skillCache.has(cacheKey)) {
        return skillCache.get(cacheKey);
    }

    const skillsDir = getSkillsDir(vertical);

    // Try folder structure first: skills/skill-name/execute.js
    const folderPath = path.join(skillsDir, skillName, 'execute.js');
    // Fallback to flat file: skills/skill-name.js
    const flatPath = path.join(skillsDir, `${skillName}.js`);

    let skillPath;
    if (fs.existsSync(folderPath)) {
        skillPath = folderPath;
    } else if (fs.existsSync(flatPath)) {
        skillPath = flatPath;
    } else {
        throw new Error(`Skill not found: ${skillName} in vertical ${vertical}`);
    }

    const skill = require(skillPath);
    skillCache.set(cacheKey, skill);
    return skill;
}

/**
 * Get all available skills for a vertical
 * Supports folder structure (skill/execute.js) and flat files (skill.js)
 */
function getAvailableSkills(vertical) {
    const skillsDir = getSkillsDir(vertical);

    if (!fs.existsSync(skillsDir)) {
        return [];
    }

    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const skills = [];
    const processedSkills = new Set();

    // Process folder-based skills first (skill-name/execute.js)
    for (const entry of entries) {
        if (entry.isDirectory()) {
            const skillName = entry.name;
            const executePath = path.join(skillsDir, skillName, 'execute.js');

            if (fs.existsSync(executePath)) {
                try {
                    const skill = loadSkill(vertical, skillName);
                    skills.push({
                        name: skill.name || skillName,
                        description: skill.description || '',
                        tier: skill.tier || 1,
                        inputSchema: skill.inputSchema || { type: 'object', properties: {} },
                        outputSchema: skill.outputSchema
                    });
                    processedSkills.add(skillName);
                } catch (error) {
                    console.error(`Error loading skill ${skillName}:`, error.message);
                }
            }
        }
    }

    // Process flat file skills (skill-name.js) - skip if already processed as folder
    for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.js')) {
            const skillName = entry.name.replace('.js', '');

            if (!processedSkills.has(skillName)) {
                try {
                    const skill = loadSkill(vertical, skillName);
                    skills.push({
                        name: skill.name || skillName,
                        description: skill.description || '',
                        tier: skill.tier || 1,
                        inputSchema: skill.inputSchema || { type: 'object', properties: {} },
                        outputSchema: skill.outputSchema
                    });
                } catch (error) {
                    console.error(`Error loading skill ${skillName}:`, error.message);
                }
            }
        }
    }

    return skills;
}

/**
 * Convert skills to tool format for AI agents
 */
function getAvailableTools(vertical) {
    const skills = getAvailableSkills(vertical);

    return skills.map(skill => ({
        name: skill.name,
        description: skill.description,
        inputSchema: {
            type: 'object',
            properties: skill.inputSchema?.properties || {},
            required: skill.inputSchema?.required || []
        }
    }));
}

/**
 * Execute a skill with given input
 * @param {string} skillName - Name of the skill to execute
 * @param {Object} input - Input parameters for the skill
 * @param {Object} context - Execution context (tenantId, dlp, audit, db)
 */
async function executeSkill(skillName, input, context = {}) {
    const { tenantId, dlp, audit, db } = context;
    const vertical = context.vertical || 'finance';

    // Load the skill
    const skill = loadSkill(vertical, skillName);

    if (!skill.execute) {
        throw new Error(`Skill ${skillName} does not have an execute function`);
    }

    // Create mock services if not provided (for standalone testing)
    const mockDlp = dlp || {
        scan: (content, options) => ({
            hasSensitiveData: false,
            findings: [],
            redacted: content
        }),
        redact: (content) => content
    };

    const mockAudit = audit || {
        log: async (entry) => {
            console.log('[AUDIT]', entry.action, entry.skillName);
            return { logged: true };
        }
    };

    const mockDb = db || {
        query: async () => ({ rows: [] })
    };

    // Build execution context
    const executionContext = {
        input: {
            ...input,
            tenant_id: tenantId  // Always use backend-provided tenant_id, ignore any from input
        },
        dlp: mockDlp,
        audit: mockAudit,
        db: mockDb
    };

    // Execute the skill
    try {
        const startTime = Date.now();
        const result = await skill.execute(executionContext);
        const duration = Date.now() - startTime;

        // Add execution metadata
        return {
            ...result,
            _meta: {
                skill: skillName,
                duration_ms: duration,
                executed_at: new Date().toISOString()
            }
        };
    } catch (error) {
        // Log error and re-throw
        console.error(`Skill execution error [${skillName}]:`, error.message);

        if (mockAudit.log) {
            await mockAudit.log({
                tenantId,
                action: 'SKILL_ERROR',
                resourceType: 'skill',
                skillName,
                meta: {
                    error: error.message,
                    input: JSON.stringify(input).substring(0, 500)
                }
            });
        }

        throw error;
    }
}

/**
 * Validate skill input against schema
 */
function validateSkillInput(skill, input) {
    if (!skill.inputSchema) {
        return { valid: true };
    }

    const required = skill.inputSchema.required || [];
    const missing = required.filter(field => !(field in input));

    if (missing.length > 0) {
        return {
            valid: false,
            errors: missing.map(field => `Missing required field: ${field}`)
        };
    }

    return { valid: true };
}

/**
 * Clear skill cache (useful for development)
 */
function clearSkillCache() {
    skillCache.clear();
}

/**
 * List all skills across all verticals
 */
function listAllSkills() {
    const verticals = ['healthcare', 'finance', 'enterprise', 'legal', 'data'];
    const allSkills = {};

    for (const vertical of verticals) {
        allSkills[vertical] = getAvailableSkills(vertical);
    }

    return allSkills;
}

module.exports = {
    executeSkill,
    getAvailableSkills,
    getAvailableTools,
    loadSkill,
    validateSkillInput,
    clearSkillCache,
    listAllSkills
};
