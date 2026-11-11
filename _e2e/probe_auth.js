const puppeteer = require('puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:3002';
const USER = 'admin@sun.cc';
const PASS = '12345678';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*', '--window-size=1440,900', '--disable-web-security'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.on('console', m => { const t = m.text(); if (/error|fail/i.test(t)) console.log('[console]', t.slice(0, 200)); });

  await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));
  // 找账号/密码输入框
  const inputs = await page.$$('input');
  console.log('inputs:', inputs.length);
  if (inputs.length >= 2) {
    await inputs[0].click({ clickCount: 3 });
    await inputs[0].type(USER);
    await inputs[1].click({ clickCount: 3 });
    await inputs[1].type(PASS);
  }
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 4000));
  console.log('URL after login:', page.url());

  const info = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button,[role="button"],a').forEach(el => {
      const t = (el.innerText || '').trim().slice(0, 30);
      const title = el.getAttribute('title') || el.getAttribute('aria-label') || '';
      if (t || title) out.push({ tag: el.tagName, text: t, title, cls: (el.className || '').toString().slice(0, 60) });
    });
    return out.slice(0, 80);
  });
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: 'shot-home.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
