const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'https://daye-nav.app.workbuddy.host';
const SC = '?sharecode=TBMY3RYXH3';
const CRED = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dist-linux', 'runtime', 'auto_login.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1700, height: 1000 },
  });
  const page = await browser.newPage();
  await page.goto(BASE + '/' + SC, { waitUntil: 'networkidle2', timeout: 150000 });
  await sleep(3000);
  const info = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    inputs: document.querySelectorAll('input').length,
    buttons: [...document.querySelectorAll('button')].map(b => (b.innerText || '').trim()).filter(Boolean).slice(0, 8),
    bodySnippet: document.body.innerText.slice(0, 200).replace(/\n+/g, ' | '),
  }));
  console.log('BEFORE LOGIN:', JSON.stringify(info, null, 1));

  const inputs = await page.$$('input');
  if (inputs.length >= 2) {
    await inputs[0].type(CRED.username || '');
    await inputs[1].type(CRED.password || '');
    await sleep(500);
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /登录|Login|Sign/i.test(x.innerText || ''));
      if (b) { b.click(); return (b.innerText || '').trim(); }
      return null;
    });
    console.log('clicked login button:', clicked);
    await sleep(8000);
  }
  const after = await page.evaluate(() => ({
    url: location.href,
    bodySnippet: document.body.innerText.slice(0, 200).replace(/\n+/g, ' | '),
  }));
  console.log('AFTER LOGIN:', JSON.stringify(after));
  await page.screenshot({ path: path.join(__dirname, 'live-login-debug.png') });
  await browser.close();
})();
