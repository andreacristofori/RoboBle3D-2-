import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.text().includes('Simulation run error') || msg.text().includes('JSSource')) {
      console.log('BROWSER CONSOLE:', msg.text());
    }
  });

  await page.goto('http://localhost:3000');
  
  // Wait for the run button
  await page.waitForSelector('button');
  
  // Click all buttons that might be the Run button
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text.includes('Run') || text.includes('Simula')) {
      await btn.click();
    }
  }
  
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
})();
