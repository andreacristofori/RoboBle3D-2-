const { execSync } = require('child_process');
try {
  const result = execSync("npm search spike-prime --json").toString();
  console.log(result.substring(0, 500));
} catch (e) {
  try {
    const r2 = execSync("npm search lego --json").toString();
    console.log(r2.substring(0, 500));
  } catch(e2) {}
}
