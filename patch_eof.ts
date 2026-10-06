import * as fs from 'fs';
const file = 'src/components/VirtualEnvironment.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `    while (currentIndent > 0) {
      const blockType = blockStack.pop();
      if (blockType === 'while') {
        jsCode += ' '.repeat(currentIndent) + 'await sleep(10);\\n';
      }
      jsCode += ' '.repeat(Math.max(0, currentIndent - 4)) + '}\\n';
      currentIndent -= 4;
    }`;

const replacement = `    while (currentIndent > 0) {
      const blockType = blockStack.pop();
      if (blockType === 'try') {
        jsCode += ' '.repeat(Math.max(0, currentIndent - 4)) + '} catch (e) {}\\n';
      } else if (blockType === 'while') {
        jsCode += ' '.repeat(currentIndent) + 'await sleep(10);\\n';
        jsCode += ' '.repeat(Math.max(0, currentIndent - 4)) + '}\\n';
      } else {
        jsCode += ' '.repeat(Math.max(0, currentIndent - 4)) + '}\\n';
      }
      currentIndent -= 4;
    }`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
console.log("Patched EOF");
