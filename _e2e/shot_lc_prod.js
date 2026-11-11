const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const B = 'https://auth.xuers.dpdns.org';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const p = await browser.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 160)));
  p.on('requestfailed', r => { const u = r.url(); if (!/qrserver|favicon/.test(u)) errs.push('FAILED ' + u.slice(0, 90)); });
  await p.goto(B + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1000);
  await p.mouse.move(1240, 140); await sleep(700);
  await p.screenshot({ path: 'prod-login.png' });

  await p.type('#username', 'admin');
  await p.type('#password', 'Fiery.813');
  await p.click('#loginBtn');
  await sleep(2400);
  console.log('进入 App:', await p.evaluate(() => !document.getElementById('appView').hidden));
  console.log('列表条数:', await p.evaluate(() => document.querySelectorAll('.lic').length));
  await p.screenshot({ path: 'prod-app.png' });
  await p.evaluate(() => document.querySelector('.nav-item[data-view="set"]').click());
  await sleep(500);
  await p.screenshot({ path: 'prod-set.png' });
  console.log('ERR:', errs.length ? errs.join('\n') : '无');
  await browser.close();
})();
