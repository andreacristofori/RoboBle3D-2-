const fs = require('fs');
const jsCode = fs.readFileSync('output.js', 'utf8');

const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

try {
  const runnerFn = new AsyncFunction(
    'sleep', 'drivePair', 'drivePairForDegrees', 'stopPair',
    'writeLightMatrix', 'clearLightMatrix', 'showImageLightMatrix',
    'playNote', 'beep', 'runMotor', 'stopMotor', 'runMotorForDegrees',
    'getColor', 'getReflection', 'getDistance', 'getForce', 'resetYaw',
    'print', 'isStopPressed',
    jsCode
  );
  console.log("Parsed successfully by AsyncFunction!");
} catch (e) {
  console.log("Parse Error:", e.message);
}
