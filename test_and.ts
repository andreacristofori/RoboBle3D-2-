import * as fs from 'fs';

const content = fs.readFileSync('src/components/VirtualEnvironment.tsx', 'utf8');
const start = content.indexOf('const transpilePythonToJs = (pythonCode: string) => {');
let end = content.indexOf('  useEffect(() => {', start);
end = content.lastIndexOf('  };', end) + 4;
let transpileCode = content.substring(start, end);

const wrapper = \`
export const transpilePythonToJsWrapper = (pythonCode: string) => {
  let activeExecutionId = { current: 1 };
  const robotRef = { current: { angle: 0, x: 0, y: 0 } };
  const sensorReadingsRef = { current: {} };
  const setConsoleLogs = (cb: any) => {};
  const setIsRunningCode = (b: boolean) => {};
  const setIsPlaying = (b: boolean) => {};
  const triggerBeep = (f: number, ms: number) => {};
  let wheelDiameter = 5.6;
  const mapType = 'default';
  const customBgImage = null;
  \${transpileCode}
  return transpilePythonToJs(pythonCode);
}
\`;
fs.writeFileSync('temp_transpiler_and.ts', wrapper);

async function run() {
  const { transpilePythonToJsWrapper: runTranspiler } = await import('./temp_transpiler_and.ts');
  
  const tc = \`while True:
    if _safe_sensor(color_sensor.color, port.D, -1) == 10 and _safe_sensor(color_sensor.color, port.C, -1) == 10:
        await _drive_pair_for_degrees(int(float(10) * 11.5 / 5.6), int(0), int(int(float(50) * 1000 / 100)))\`;

  console.log(runTranspiler(tc));
}

run();
