const { execSync } = require('child_process');
try {
  const result = execSync("npm view @abandonware/noble --json").toString();
  console.log(result.substring(0, 50));
} catch (e) {
}
