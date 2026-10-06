import * as fs from 'fs';

const content = fs.readFileSync('src/components/VirtualEnvironment.tsx', 'utf8');
const start = content.indexOf('const transpilePythonToJs = (pythonCode: string) => {');
let end = content.indexOf('  useEffect(() => {', start);
end = content.lastIndexOf('  };', end) + 4;

let transpileCode = content.substring(start, end);

const wrapper = `
export const transpilePythonToJsWrapper = (pythonCode: string) => {
  let activeExecutionId = 1;
  const robotRef = { current: { angle: 0, x: 0, y: 0 } };
  const sensorReadingsRef = { current: {} };
  const setConsoleLogs = (cb: any) => {};
  const setIsRunningCode = (b: boolean) => {};
  const setIsPlaying = (b: boolean) => {};
  const triggerBeep = (f: number, ms: number) => {};
  let wheelDiameter = 5.6;
  const mapType = 'default';
  const customBgImage = null;

  ${transpileCode}

  return transpilePythonToJs(pythonCode);
}
`;

fs.writeFileSync('temp_transpiler.ts', wrapper);
