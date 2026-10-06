const https = require('https');
https.get('https://raw.githubusercontent.com/sanjayseshan/spikeprime-tools/master/js/hub.js', res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log(data.substring(0, 1000)));
});
