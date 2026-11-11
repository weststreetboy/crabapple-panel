const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'https://daye-nav.app.workbuddy.host';
const SC = '?sharecode=TBMY3RYXH3';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.on('dialog', async d => { await d.accept(); });
  const errs = [];
  page.on('console', m => { const t = m.text(); if (/error|fail/i.test(t)) errs.push(t.slice(0, 140)); });
  page.on('requestfailed', r => errs.push('REQFAIL ' + r.url().slice(0, 120)));

  // 1. 首页 + 视频背景
  await page.goto(BASE + '/' + SC, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(3500);
  const vinfo = await page.evaluate(() => {
    const v = document.querySelector('video');
    if (!v) return { found: false };
    const r = v.getBoundingClientRect();
    return {
      found: true, src: (v.currentSrc || v.src || '').split('/').pop().slice(0, 40),
      paused: v.paused, readyState: v.readyState, w: v.videoWidth, h: v.videoHeight,
      muted: v.muted, inline: v.hasAttribute('playsinline'), loop: v.loop,
      transform: getComputedStyle(v).transform.slice(0, 30), box: Math.round(r.width) + 'x' + Math.round(r.height),
    };
  });
  console.log('VIDEO:', JSON.stringify(vinfo));
  await page.screenshot({ path: 'pub-home.png' });

  // 2. 登录
  await page.goto(BASE + '/login' + SC, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1500);
  const inputs = await page.$$('input');
  if (inputs.length < 2) { console.log('LOGIN: inputs missing'); }
  await inputs[0].type('admin@sun.cc');
  await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter');
  await sleep(4000);

  // 3. 打开设置台
  await page.mouse.click(1397, 43);
  await sleep(1500);

  const clickText = t => page.evaluate((x) => {
    const els = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && (e.innerText || '').trim() === x);
    if (!els.length) return false;
    els[0].click();
    return true;
  }, t);

  // 4. 账号管理页看 PRO 徽章
  await clickText('账号管理');
  await sleep(2000);
  const acc = await page.evaluate(() => {
    const t = document.body.innerText.replace(/\s+/g, ' ');
    const i = t.indexOf('账号管理');
    return { hasNonPro: /非\s?PRO/.test(t), snippet: t.slice(i, i + 200) };
  });
  console.log('ACCOUNT:', JSON.stringify(acc));

  // 5. 授权管理页
  await clickText('授权管理');
  await sleep(2500);
  const panel = await page.evaluate(() => {
    const el = document.querySelector('.la-wrap');
    if (!el) return 'not mounted';
    return {
      state: el.querySelector('#la-state').textContent.trim(),
      meta: el.querySelector('#la-meta').textContent.replace(/\s+/g, ' ').trim(),
      code: el.querySelector('#la-code').textContent.trim(),
      buttons: [...el.querySelectorAll('button')].map(b => b.textContent.trim()),
    };
  });
  console.log('PANEL:', JSON.stringify(panel));
  await page.screenshot({ path: 'pub-auth.png' });

  console.log('ERRS:', errs.length, JSON.stringify(errs.slice(0, 6)));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
