const fs = require('fs');
const jsCode = fs.readFileSync('output.js', 'utf8');

// Also remove import statements as a hack to see if it parses
let clean = jsCode.split('\n').filter(line => !line.trim().startsWith('import') && !line.trim().startsWith('from ')).join('\n');
fs.writeFileSync('clean.js', clean);

try {
  new Function('sleep', clean);
  console.log("Parsed successfully!");
} catch (e) {
  console.log("Parse Error:", e.message);
  process.exit(1);
}
