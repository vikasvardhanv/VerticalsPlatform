/**
 * Schema Validator - Check all finance skills for valid schemas
 */

const fs = require('fs');
const path = require('path');

const skillsDir = path.join(__dirname, 'verticals/finance/skills');

function validateSchema(schema, skillName, path = '') {
  const errors = [];

  if (!schema || typeof schema !== 'object') {
    return errors;
  }

  // Check for arrays without items
  if (schema.type === 'array' && !schema.items) {
    errors.push({
      skill: skillName,
      path: path,
      error: 'Array type missing required "items" property',
      schema: JSON.stringify(schema, null, 2)
    });
  }

  // Check properties recursively
  if (schema.properties) {
    for (const [key, value] of Object.entries(schema.properties)) {
      const subPath = path ? `${path}.${key}` : key;
      errors.push(...validateSchema(value, skillName, subPath));
    }
  }

  // Check items recursively
  if (schema.items) {
    errors.push(...validateSchema(schema.items, skillName, `${path}[items]`));
  }

  return errors;
}

function checkSkill(skillPath) {
  try {
    // Clear require cache
    delete require.cache[require.resolve(skillPath)];

    const skill = require(skillPath);
    const errors = [];

    if (!skill.inputSchema) {
      return [{
        skill: path.basename(path.dirname(skillPath)),
        error: 'Missing inputSchema'
      }];
    }

    // Validate input schema
    errors.push(...validateSchema(skill.inputSchema, skill.name || path.basename(path.dirname(skillPath)), 'inputSchema'));

    // Validate output schema if present
    if (skill.outputSchema) {
      errors.push(...validateSchema(skill.outputSchema, skill.name || path.basename(path.dirname(skillPath)), 'outputSchema'));
    }

    return errors;
  } catch (error) {
    return [{
      skill: path.basename(path.dirname(skillPath)),
      error: `Failed to load: ${error.message}`
    }];
  }
}

console.log('🔍 Checking all finance skill schemas...\n');

const skills = fs.readdirSync(skillsDir);
let totalErrors = 0;
const errorsBySkill = {};

for (const skill of skills) {
  const executeFile = path.join(skillsDir, skill, 'execute.js');

  if (fs.existsSync(executeFile)) {
    const errors = checkSkill(executeFile);

    if (errors.length > 0) {
      errorsBySkill[skill] = errors;
      totalErrors += errors.length;
    }
  }
}

if (totalErrors === 0) {
  console.log('✅ All schemas are valid!\n');
} else {
  console.log(`❌ Found ${totalErrors} schema error(s) in ${Object.keys(errorsBySkill).length} skill(s):\n`);

  for (const [skill, errors] of Object.entries(errorsBySkill)) {
    console.log(`\n📛 ${skill}:`);
    errors.forEach(err => {
      console.log(`   - ${err.path}: ${err.error}`);
      if (err.schema) {
        console.log(`     Schema: ${err.schema.split('\n')[0]}...`);
      }
    });
  }

  console.log(`\n💡 Fix these errors by adding "items" property to array types.\n`);
  process.exit(1);
}
