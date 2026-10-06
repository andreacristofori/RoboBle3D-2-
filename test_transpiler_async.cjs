const fs = require('fs');
const { transpilePythonToJs } = require('./test_transpiler.cjs');

const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

const testCodes = [
  `if (button.pressed(button.CENTER) if hasattr(button, 'CENTER') else (button.center.is_pressed() if hasattr(button, 'center') else False)):
    print("Pressed")`,
  `a = (a if isinstance(a, Number) else 0) + 1`
];

for (const [index, testCode] of testCodes.entries()) {
  console.log(`\n=== TESTING BLOCK ${index + 1} ===`);
  const result = transpilePythonToJs(testCode);
  console.log("Transpiled JS:\n", result);
  try {
    new AsyncFunction(
      'sleep', 'drivePair', 'drivePairForDegrees', 'stopPair',
      'writeLightMatrix', 'clearLightMatrix', 'showImageLightMatrix',
      'playNote', 'beep', 'runMotor', 'stopMotor', 'runMotorForDegrees',
      'resetYaw', 'getColor', 'getReflection', 'getDistance', 'getForce',
      'getYaw', 'getPitch', 'getRoll', 'print',
      'py_int', 'py_float', 'py_str', 'py_len', 'py_abs', 'py_round', 'py_min', 'py_max',
      'str', 'len', 'abs', 'round', 'min', 'max',
      `try {
        ${result}
      } catch(e) {
        if (e.message !== 'Interrupted') {
           throw e;
        }
      }`
    );
    console.log("-> PARSED BY ASYNCFUNCTION: ✅ SUCCESS");
  } catch (err) {
    console.error("-> PARSED BY ASYNCFUNCTION: ❌ FAILED:", err.message);
  }
}
