const { execSync } = require('child_process');
try {
  const result = execSync("npm view spike-prime-ble --json").toString();
  console.log(result.substring(0, 50));
} catch (e) {
  console.log("no");
}
