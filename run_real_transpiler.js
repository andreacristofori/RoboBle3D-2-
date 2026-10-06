import fs from 'fs';

// Read VirtualEnvironment.tsx
const content = fs.readFileSync('src/components/VirtualEnvironment.tsx', 'utf8');

// Extract transpilePythonToJs
const start = content.indexOf('const transpilePythonToJs = (pythonCode: string) => {');
let end = content.indexOf('  useEffect(() => {', start);
end = content.lastIndexOf('  };', end) + 4;

let transpileCode = content.substring(start, end);

// Strip Typescript types
transpileCode = transpileCode.replace(/pythonCode: string/g, 'pythonCode');
transpileCode = transpileCode.replace(/const declaredVars = new Set<string>\(\);/g, 'const declaredVars = new Set();');
transpileCode = transpileCode.replace(/const varName = forInMatch\[1\];/g, 'const varName = forInMatch[1];');
transpileCode = transpileCode.replace(/const translateStatement = \(stmt: string\): string => {/g, 'const translateStatement = (stmt) => {');
transpileCode = transpileCode.replace(/const translateExpression = \(expr: string\): string => {/g, 'const translateExpression = (expr) => {');
transpileCode = transpileCode.replace(/const extractUserCode = \(fullCode: string\) => {/g, 'const extractUserCode = (fullCode) => {');
transpileCode = transpileCode.replace(/const sleep = \(ms: number\) => {/g, 'const sleep = (ms) => {');
transpileCode = transpileCode.replace(/const isStopPressed = \(\): boolean => {/g, 'const isStopPressed = () => {');
transpileCode = transpileCode.replace(/<void>/g, '');
transpileCode = transpileCode.replace(/as any/g, '');

// Make it exportable
transpileCode += '\nexport { transpilePythonToJs };\n';

fs.writeFileSync('real_transpiler.js', transpileCode);
