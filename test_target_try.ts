import * as fs from 'fs';
const file = 'src/components/VirtualEnvironment.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `      while (indent < currentIndent) {
        let hasExceptFollowing = trimmed.startsWith('except') || trimmed.startsWith('finally');
        // Look ahead for except/finally
        for (let j = i + 1; j < lines.length; j++) {
            const nextLine = lines[j].trim();
            if (nextLine && !nextLine.startsWith('#')) {
              if (nextLine.startsWith('except') || nextLine.startsWith('finally')) {
                hasExceptFollowing = true;
              }
              break;
            }
        }
        
        const blockType = blockStack.pop();
        if (blockType === 'try' && !hasExceptFollowing) {`;

const replacement = `      while (indent < currentIndent) {
        const isTargetTry = (currentIndent - 4 === indent) && (trimmed.startsWith('except') || trimmed.startsWith('finally'));
        
        const blockType = blockStack.pop();
        if (blockType === 'try' && !isTargetTry) {`;

content = content.replace(target, replacement);
fs.writeFileSync('src/components/VirtualEnvironment.tsx', content);
console.log("Patched target try");
