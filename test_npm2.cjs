const { execSync } = require('child_process');
try {
  const result = execSync("npm search lwp3 --json").toString();
  console.log(result);
} catch (e) {
  console.error(e);
}
