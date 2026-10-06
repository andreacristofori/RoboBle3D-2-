const { execSync } = require('child_process');
try {
  const r2 = execSync("npm search lego --json").toString();
  const data = JSON.parse(r2);
  data.forEach(x => console.log(x.name, x.description));
} catch(e2) {}
