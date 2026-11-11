const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'https://daye-nav.app.workbuddy.host';
const SC = '?sharecode=TBMY3RYXH3';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*', '--autoplay-policy=no-user-gesture-required'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.on('dialog', async d => { await d.accept(); });
  const fails = [];
  page.on('requestfailed', r => { if (/micro_app|\/custom\/|\/assets\//.test(r.url())) fails.push('FAIL ' + r.url().split('/').slice(3).join('/').slice(0, 90)); });
  page.on('response', r => { const u = r.url(); if (/micro_app/.test(u) && r.status() >= 400) fails.push(r.status() + ' ' + u.split('/').slice(3).join('/').slice(0, 90)); });

  // 登录
  await page.goto(BASE + '/login' + SC, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(1500);
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc');
  await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter');
  await sleep(5000);

  // 首页
  await page.goto(BASE + '/' + SC, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(6000);
  const home = await page.evaluate(() => {
    const v = document.querySelector('video');
    let vinfo = { found: false };
    if (v) {
      const cs = getComputedStyle(v);
      vinfo = {
        found: true, paused: v.paused, rs: v.readyState, wh: v.videoWidth + 'x' + v.videoHeight,
        muted: v.muted, inline: v.hasAttribute('playsinline'), loop: v.loop,
        t: +v.currentTime.toFixed(2), willChange: cs.willChange, transform: cs.transform.slice(0, 28),
        poster: !!document.querySelector('.sp-bg-poster'),
      };
    }
    const imgs = [...document.images].filter(i => /micro_app/.test(i.src)).length;
    return {
      video: vinfo, microImg: imgs,
      cards: document.querySelectorAll('.item-icon-box, .app-item, [class*="item-icon"]').length,
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 120),
    };
  });
  console.log('HOME:', JSON.stringify(home));
  await page.screenshot({ path: 'pub-home2.png' });

  // 授权页
  await page.mouse.click(1397, 43);
  await sleep(1500);
  const clickText = t => page.evaluate((x) => {
    const els = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && (e.innerText || '').trim() === x);
    if (!els.length) return false;
    els[0].click(); return true;
  }, t);
  await clickText('授权管理');
  await sleep(2500);
  const panel = await page.evaluate(() => {
    const el = document.querySelector('.la-wrap');
    if (!el) return 'not mounted';
    return {
      state: el.querySelector('#la-state').textContent.trim(),
      meta: el.querySelector('#la-meta').textContent.replace(/\s+/g, ' ').trim(),
      code: el.querySelector('#la-code').textContent.trim(),
      btns: [...el.querySelectorAll('button')].map(b => b.textContent.trim()),
    };
  });
  console.log('PANEL:', JSON.stringify(panel));
  await page.screenshot({ path: 'pub-auth2.png' });

  console.log('FAILS:', fails.length, JSON.stringify([...new Set(fails)].slice(0, 8)));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
