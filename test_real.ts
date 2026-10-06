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
fs.writeFileSync('temp_transpiler_real.ts', wrapper);

async function run() {
  const { transpilePythonToJsWrapper: runTranspiler } = await import('./temp_transpiler_real.ts');
  
  const tc = "while True:\n" +
    "    if _safe_sensor(color_sensor.color, port.D, -1) == 10 and _safe_sensor(color_sensor.color, port.C, -1) == 10:\n" +
    "        await _drive_pair_for_degrees(int(float(10) * 11.5 / 5.6), int(0), int(int(float(50) * 1000 / 100)))";

  try {
    const js = runTranspiler(tc);
    console.log(js);
  } catch (e) {
    console.log("ERROR:", e);
  }
}

run();
