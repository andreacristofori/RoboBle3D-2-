const https = require('https');
https.get('https://api.github.com/search/code?q=6e400001+SPIKE', { headers: { 'User-Agent': 'node' } }, (res) => {
  res.on('data', d => process.stdout.write(d));
});
