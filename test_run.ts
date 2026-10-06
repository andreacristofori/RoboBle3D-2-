import * as fs from 'fs';

const content = fs.readFileSync('src/components/VirtualEnvironment.tsx', 'utf8');
const start = content.indexOf('const transpilePythonToJs = (pythonCode: string) => {');
let end = content.indexOf('  useEffect(() => {', start);
end = content.lastIndexOf('  };', end) + 4;
let transpileCode = content.substring(start, end);

const wrapper = "export const transpilePythonToJsWrapper = (pythonCode: string) => {\n" +
  transpileCode +
  "\nreturn transpilePythonToJs(pythonCode);\n" +
  "}";
fs.writeFileSync('temp_transpiler_run.ts', wrapper);
