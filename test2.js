import { transpilePythonToJsWrapper } from './temp.js';
import fs from 'fs';
const editor = fs.readFileSync('src/components/BlocklyEditor.tsx', 'utf8');
const match = editor.match(/const generateFullCode =.*?return \`(.*?)\`;/s);
let py = match[1];
py = py.replace(/\$\{.*?\}/g, 'A');

const js = transpilePythonToJsWrapper(py);
fs.writeFileSync('output.js', js);
console.log('done');
