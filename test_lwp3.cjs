const http = require('https');
http.get('https://raw.githubusercontent.com/sanjayseshan/spikeprime-tools/main/js/ble.js', res => {
  res.on('data', d => process.stdout.write(d));
});
