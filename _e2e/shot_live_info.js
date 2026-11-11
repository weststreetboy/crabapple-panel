const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'],
    defaultViewport: { width: 1180, height: 1000 } });
  const p = await b.newPage();
  for (const [name, url] of [['cmp','https://auth.xuers.dpdns.org/compare'],['faq','https://auth.xuers.dpdns.org/faq']]) {
    const r = await p.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 800));
    const t = await p.evaluate(() => document.title + ' | ' + document.body.innerText.slice(0,40).replace(/\n/g,' '));
    console.log(name, r.status(), t);
    await p.screenshot({ path: 'live-' + name + '.png', fullPage: true });
  }
  await b.close();
})();
