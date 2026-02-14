/**
 * Schema Fixer - Automatically fix array types missing items property
 */

const fs = require('fs');
const path = require('path');

const skillsDir = path.join(__dirname, 'verticals/finance/skills');

function fixSchemaInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let fixed = false;

  // Pattern 1: type: 'array' without items (with comma)
  const pattern1 = /(\s+)type: 'array',(\s+description:[^\n]+)/g;
  if (pattern1.test(content)) {
    content = content.replace(
      /(\s+)type: 'array',(\s+description:[^\n]+)/g,
      "$1type: 'array',\n$1items: { type: 'object' },$2"
    );
    fixed = true;
  }

  // Pattern 2: type: 'array' without items (end of object)
  const pattern2 = /(\s+)type: 'array'(\s+\})/g;
  if (pattern2.test(content)) {
    content = content.replace(
      /(\s+)type: 'array'(\s+\})/g,
      "$1type: 'array',\n$1items: { type: 'object' }$2"
    );
    fixed = true;
  }

  // Pattern 3: type: 'array' at end of properties
  const pattern3 = /(\s+)type: 'array'(\s*\n\s*\}[,\s]*\n)/g;
  if (pattern3.test(content)) {
    content = content.replace(
      /(\s+)type: 'array'(\s*\n\s*\}[,\s]*\n)/g,
      "$1type: 'array',\n$1items: { type: 'object' }$2"
    );
    fixed = true;
  }

  if (fixed) {
    fs.writeFileSync(filePath, content, 'utf8');
  }

  return fixed;
}

console.log('🔧 Fixing all schema errors...\n');

const skills = fs.readdirSync(skillsDir);
let fixedCount = 0;

for (const skill of skills) {
  const executeFile = path.join(skillsDir, skill, 'execute.js');

  if (fs.existsSync(executeFile)) {
    const wasFixed = fixSchemaInFile(executeFile);

    if (wasFixed) {
      console.log(`✅ Fixed: ${skill}`);
      fixedCount++;
    }
  }
}

console.log(`\n✨ Fixed ${fixedCount} skill(s)\n`);

// Run validator again
console.log('🔍 Validating fixes...\n');
require('./check-schemas.js');
