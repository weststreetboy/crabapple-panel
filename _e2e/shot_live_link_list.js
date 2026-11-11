const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 780, height: 1000 },
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

  await p.goto('https://auth.xuers.dpdns.org/', { waitUntil: 'networkidle2', timeout: 60000 });
  await p.type('#password', 'Fiery.813');
  await p.click('#loginBtn');
  await new Promise((r) => setTimeout(r, 2000));

  await p.click('button[data-view="link"]');
  await new Promise((r) => setTimeout(r, 1500));

  const info = await p.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#linkList .lic'));
    return cards.map((c) => c.innerText.replace(/\n+/g, ' | ').slice(0, 300));
  });
  console.log('线上卡片:', JSON.stringify(info, null, 1));
  console.log('ERRORS:', JSON.stringify(errs.slice(0, 3)));

  const el = await p.$('#linkList');
  if (el) await el.screenshot({ path: path.join(__dirname, 'shot-live-list.png') });
  else await p.screenshot({ path: path.join(__dirname, 'shot-live-list.png') });

  await b.close();
})();
