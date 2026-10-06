const { execSync } = require('child_process');
try {
  const result = execSync("npm search spike-prime --json").toString();
  console.log(result.substring(0, 500));
} catch (e) {
  console.error(e);
}
