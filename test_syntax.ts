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
fs.writeFileSync('temp_transpiler_syntax.ts', wrapper);

async function run() {
  const { transpilePythonToJsWrapper: runTranspiler } = await import('./temp_transpiler_syntax.ts');
  
  const tc = "try:\n" +
    "    if True:\n" +
    "        pass\n" +
    "except:\n" +
    "    pass";

  try {
    const js = runTranspiler(tc);
    console.log("== JS ==");
    console.log(js);
    console.log("========");
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    try {
        new AsyncFunction("sleep", js);
        console.log("Valid syntax!");
    } catch(e) {
        console.error("SyntaxError:", e.message);
    }
  } catch (e) {
    console.log("ERROR:", e);
  }
}

run();
