const fs = require('fs');
const path = require('path');

/**
 * Auto-discover and load all skills from verticals directory
 */
function loadAllSkills() {
  const skills = {};
  const verticalsPath = path.join(__dirname, '../../verticals');

  // List all verticals (healthcare, finance, enterprise, legal, data)
  const verticals = fs.readdirSync(verticalsPath)
    .filter(name => fs.statSync(path.join(verticalsPath, name)).isDirectory());

  for (const vertical of verticals) {
    const skillsPath = path.join(verticalsPath, vertical, 'skills');

    // Skip if no skills directory
    if (!fs.existsSync(skillsPath)) {
      console.log(`[SKILL-LOADER] No skills directory for ${vertical}, skipping`);
      continue;
    }

    // List all skill directories
    const skillDirs = fs.readdirSync(skillsPath)
      .filter(name => fs.statSync(path.join(skillsPath, name)).isDirectory());

    for (const skillDir of skillDirs) {
      const skillPath = path.join(skillsPath, skillDir);
      const executePath = path.join(skillPath, 'execute.js');

      // Check if execute.js exists
      if (!fs.existsSync(executePath)) {
        console.log(`[SKILL-LOADER] Skipping ${skillDir} (no execute.js)`);
        continue;
      }

      try {
        const skillModule = require(executePath);
        const skillName = skillModule.name || skillDir;

        skills[skillName] = {
          ...skillModule,
          _path: executePath,
          _vertical: vertical
        };

        console.log(`[SKILL-LOADER] ✓ Loaded ${skillName} (${vertical}, tier ${skillModule.tier})`);
      } catch (error) {
        console.error(`[SKILL-LOADER] ✗ Failed to load ${skillDir}:`, error.message);
      }
    }
  }

  console.log(`[SKILL-LOADER] Total skills loaded: ${Object.keys(skills).length}`);
  return skills;
}

/**
 * Generate tool definitions for Claude
 */
function generateToolDefinitions(skills, vertical = null) {
  const filteredSkills = vertical
    ? Object.entries(skills).filter(([_, skill]) => skill._vertical === vertical)
    : Object.entries(skills);

  return filteredSkills.map(([name, skill]) => ({
    name: name,
    description: skill.description || `Execute ${name} skill`,
    input_schema: skill.inputSchema || {
      type: 'object',
      properties: {},
      required: []
    }
  }));
}

module.exports = {
  loadAllSkills,
  generateToolDefinitions
};
