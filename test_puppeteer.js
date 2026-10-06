import puppeteer from 'puppeteer-core';
import { exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);

(async () => {
  // Restart the server
  exec('npm run dev');
  await new Promise(r => setTimeout(r, 3000));
  
  // Need to find a working Chromium
  // I will just use the standard puppeteer if it works. But earlier it failed.
  // Wait, I can just use curl to get the index.html but I need to execute JS!
  // Since I can't use puppeteer, I'll use the testing suite itself by triggering another test!
  console.log("ready");
})();
