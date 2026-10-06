const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  "console.error(err);\n      setLogs(prev => prev + `Errore di connessione Bluetooth: ${err.message}\\n`);",
  "console.error(err);\n      alert(`Errore Bluetooth: ${err.message}`);\n      setLogs(prev => prev + `Errore di connessione Bluetooth: ${err.message}\\n`);"
);

fs.writeFileSync('src/App.tsx', code);
