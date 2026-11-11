const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'https://daye-nav.app.workbuddy.host';
const SC = '?sharecode=TBMY3RYXH3';
const CRED = { username: 'admin@sun.cc', password: 'Fiery.813' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1700, height: 1000 },
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  const fails = [];
  page.on('requestfailed', r => fails.push(r.url().slice(0, 120)));

  await page.goto(BASE + '/' + SC, { waitUntil: 'networkidle2', timeout: 150000 });
  await sleep(2500);
  const needLogin = await page.evaluate(() => !!document.querySelector('input'));
  if (needLogin) {
    const inputs = await page.$$('input');
    await inputs[0].type(CRED.username);
    await inputs[1].type(CRED.password);
    await sleep(400);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /登录|Login/i.test(x.innerText || ''));
      if (b) b.click();
    });
    await sleep(7000);
  }
  const url = page.url();
  const state = await page.evaluate(() => {
    const txt = document.body.innerText;
    const classes = {};
    document.querySelectorAll('[class]').forEach(el => {
      String(el.className).split(/\s+/).forEach(c => { if (c) classes[c] = (classes[c] || 0) + 1; });
    });
    const pick = Object.entries(classes).filter(([k]) => /item|card|app/i.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 12);
    return {
      loggedIn: !/\/login/i.test(location.href) && !/账号|密码/.test(txt.slice(0, 200)),
      title: document.title,
      hasBgVideo: !!document.querySelector('video'),
      videoPlaying: (() => { const v = document.querySelector('video'); return v ? !v.paused : null; })(),
      cardClasses: pick,
      hasFeatures: typeof window.__spFeatures !== 'undefined' || !!document.querySelector('[data-sp-gear], .sp-feat-pop, #sp-gear'),
      favicon: (document.querySelector('link[rel="icon"]') || {}).href || null,
      snippet: txt.replace(/\s+/g, ' ').slice(0, 240),
    };
  });
  await page.screenshot({ path: path.join(__dirname, 'shot-after-deploy.png'), fullPage: false });
  console.log('URL:', url.split('?')[0]);
  console.log(JSON.stringify(state, null, 2));
  console.log('pageErrors:', JSON.stringify(errs.slice(0, 6)));
  console.log('requestFailed:', JSON.stringify(fails.slice(0, 8)));
  await browser.close();
})();
