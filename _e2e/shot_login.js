const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'] });
  const url = process.argv[2] || 'http://127.0.0.1:8791/';
  // 桌面
  let p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(url, { waitUntil: 'networkidle2', timeout: 40000 });
  await new Promise(r => setTimeout(r, 900));
  await p.screenshot({ path: 'lg-desktop.png' });
  await p.type('#username', 'admin');
  await p.type('#password', 'Fiery.813');
  await new Promise(r => setTimeout(r, 900));
  await p.screenshot({ path: 'lg-typing.png' });
  await p.click('#togglePwd');
  await new Promise(r => setTimeout(r, 1500));
  await p.screenshot({ path: 'lg-peek.png' });
  console.log('errors:', JSON.stringify(errs.slice(0, 5)));
  // 手机
  const m = await b.newPage();
  await m.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await m.goto(url, { waitUntil: 'networkidle2', timeout: 40000 });
  await new Promise(r => setTimeout(r, 700));
  await m.screenshot({ path: 'lg-mobile.png' });
  await b.close();
})();
