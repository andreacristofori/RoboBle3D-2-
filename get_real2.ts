import fs from 'fs';
import { transpilePythonToJsWrapper } from './temp_transpiler.ts';

const editor = fs.readFileSync('src/components/BlocklyEditor.tsx', 'utf8');
const match = editor.match(/const generateFullCode =.*?return \`(.*?)\`;/s);
let py = match[1];

// Evaluate the template literal like the browser would
py = py.replace('${config.leftPort}', 'A')
       .replace('${config.rightPort}', 'B')
       .replace('${config.leftInverted ? \'True\' : \'False\'}', 'False')
       .replace('${config.rightInverted ? \'True\' : \'False\'}', 'False')
       .replace('${wheelDiameter || 5.6}', '5.6')
       .replace('${wheelDistance || 11.5}', '11.5')
       .replace('${indentedCode}', '    pass');

const js = transpilePythonToJsWrapper(py);
fs.writeFileSync('output_real2.js', js);
console.log("Written to output_real2.js");
