const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'],
    defaultViewport: { width: 1180, height: 1000 } });
  const p = await b.newPage();
  for (const [name, url] of [['cmp','http://127.0.0.1:8791/compare'],['faq','http://127.0.0.1:8791/faq']]) {
    await p.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 600));
    await p.screenshot({ path: 'shot-info-' + name + '.png', fullPage: true });
  }
  await b.close();
})();
