import fs from 'fs';
import { transpilePythonToJs } from './real_transpiler.js';

const py = fs.readFileSync('python_code.py', 'utf8');
const js = transpilePythonToJs(py);
fs.writeFileSync('output.js', js);
console.log("Transpilation finished");
