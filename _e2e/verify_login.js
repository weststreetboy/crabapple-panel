const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://127.0.0.1:8791/', { waitUntil: 'networkidle2', timeout: 40000 });
  await new Promise(r => setTimeout(r, 500));
  await p.type('#username', 'admin');
  await p.type('#password', 'Fiery.813');
  await p.click('#loginBtn');
  await new Promise(r => setTimeout(r, 2500));
  const state = await p.evaluate(() => ({
    loginHidden: document.getElementById('loginView').hidden,
    appHidden: document.getElementById('appView').hidden,
    title: document.getElementById('pageTitle') && document.getElementById('pageTitle').textContent,
    err: (document.getElementById('loginErr') || {}).hidden === false ? document.getElementById('loginErr').textContent : ''
  }));
  console.log(JSON.stringify(state), 'errors:', JSON.stringify(errs.slice(0,3)));
  await p.screenshot({ path: 'lg-app.png' });
  await b.close();
})();
