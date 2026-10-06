import * as fs from 'fs';
const file = 'src/components/VirtualEnvironment.tsx';
let content = fs.readFileSync(file, 'utf8');

const target1 = `      } else if (translated.startsWith('except') && translated.endsWith(':')) {
        translated = 'catch (e) {';
        currentIndent = indent + 4;
      } else if (translated === 'finally:') {
        translated = 'finally {';
        currentIndent = indent + 4;`;

const replacement1 = `      } else if (translated.startsWith('except') && translated.endsWith(':')) {
        translated = 'catch (e) {';
        currentIndent = indent + 4;
        blockStack.push('except');
      } else if (translated === 'finally:') {
        translated = 'finally {';
        currentIndent = indent + 4;
        blockStack.push('except');`;

const target2 = `      } else if (translated.startsWith('try: ')) {
        const stmt = translated.substring(5).trim();
        translated = \`try { \${translateStatement(stmt)}\`;
        currentIndent = indent + 4;
        blockStack.push('try');
      } else if (translated.startsWith('except:')) {
        const stmt = translated.substring(7).trim();
        const jsStmt = stmt === 'pass' ? '' : translateStatement(stmt);
        translated = \`catch (e) { \${jsStmt} }\`;
      } else if (translated.startsWith('except ') && !translated.endsWith(':')) {
        const colonIndex = translated.indexOf(':');
        if (colonIndex !== -1) {
          const stmt = translated.substring(colonIndex + 1).trim();
          const jsStmt = stmt === 'pass' ? '' : translateStatement(stmt);
          translated = \`catch (e) { \${jsStmt} }\`;
        }
      }`;

const replacement2 = `      } else if (translated.startsWith('try: ')) {
        const stmt = translated.substring(5).trim();
        translated = \`try { \${translateStatement(stmt)}\`;
        currentIndent = indent + 4;
        blockStack.push('try');
      } else if (translated.startsWith('except:')) {
        const stmt = translated.substring(7).trim();
        const jsStmt = stmt === 'pass' ? '' : translateStatement(stmt);
        translated = \`catch (e) { \${jsStmt} }\`;
        // One-liner except doesn't change currentIndent, so no push needed
      } else if (translated.startsWith('except ') && !translated.endsWith(':')) {
        const colonIndex = translated.indexOf(':');
        if (colonIndex !== -1) {
          const stmt = translated.substring(colonIndex + 1).trim();
          const jsStmt = stmt === 'pass' ? '' : translateStatement(stmt);
          translated = \`catch (e) { \${jsStmt} }\`;
          // One-liner except doesn't change currentIndent, so no push needed
        }
      }`;

content = content.replace(target1, replacement1);
content = content.replace(target2, replacement2);
fs.writeFileSync('src/components/VirtualEnvironment.tsx', content);
console.log("Patched except push");
