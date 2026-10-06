import * as fs from 'fs';

const content = fs.readFileSync('src/components/VirtualEnvironment.tsx', 'utf8');
const start = content.indexOf('const transpilePythonToJs = (pythonCode: string) => {');
let end = content.indexOf('  useEffect(() => {', start);
end = content.lastIndexOf('  };', end) + 4;
let transpileCode = content.substring(start, end);

const wrapper = "export const transpilePythonToJsWrapper = (pythonCode: string) => {\n" +
  "let activeExecutionId = { current: 1 };\n" +
  "const robotRef = { current: { angle: 0, x: 0, y: 0 } };\n" +
  "const sensorReadingsRef = { current: {} };\n" +
  "const setConsoleLogs = (cb: any) => {};\n" +
  "const setIsRunningCode = (b: boolean) => {};\n" +
  "const setIsPlaying = (b: boolean) => {};\n" +
  "const triggerBeep = (f: number, ms: number) => {};\n" +
  "let wheelDiameter = 5.6;\n" +
  "const mapType = 'default';\n" +
  "const customBgImage = null;\n" +
  transpileCode +
  "\nreturn transpilePythonToJs(pythonCode);\n" +
  "}";
fs.writeFileSync('temp_transpiler_loop.ts', wrapper);

async function run() {
  const { transpilePythonToJsWrapper: runTranspiler } = await import('./temp_transpiler_loop.ts');
  
  const tc = "while True:\n" +
    "    if 0 == 0:\n" +
    "        pass\n" +
    "    print('hello')";

  console.log(runTranspiler(tc));
}

run();
