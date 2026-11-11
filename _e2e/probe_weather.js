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
  const net = [];
  page.on('response', async r => {
    const u = r.url();
    if (/uapis|weatherapi|open-meteo|qweather/i.test(u)) net.push(r.status() + ' ' + u.slice(0, 110));
  });
  page.on('requestfailed', r => {
    const u = r.url();
    if (/uapis|weather/i.test(u)) net.push('FAIL ' + (r.failure() || {}).errorText + ' ' + u.slice(0, 110));
  });
  const logs = [];
  page.on('console', m => { const t = m.text(); if (/天气|weather|CORS|fetch|error/i.test(t)) logs.push(t.slice(0, 170)); });

  await page.goto(BASE + '/login' + SC, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(1500);
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc');
  await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter');
  await sleep(4500);

  await page.goto(BASE + '/' + SC, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(8000);

  // 找天气卡片
  const info = await page.evaluate(() => {
    const out = { frames: 0, cards: [] };
    out.frames = window.frames.length;
    // 遍历所有 iframe 内容
    const walk = (doc, depth) => {
      const res = [];
      let els = [];
      try { els = [...doc.querySelectorAll('*')]; } catch (e) { return res; }
      for (const e of els) {
        if (e.tagName === 'IFRAME') {
          try { res.push(...walk(e.contentDocument, depth + 1)); } catch (err) { res.push({ err: 'cross-origin iframe: ' + (e.src || 'srcdoc').slice(0, 40) }); }
        }
      }
      return res;
    };
    const frames = [...document.querySelectorAll('iframe')].map(f => ({ src: (f.src || 'about:srcdoc').slice(0, 60), w: Math.round(f.getBoundingClientRect().width) }));
    out.iframes = frames;
    // 卡片文本
    out.text = document.body.innerText.replace(/\s+/g, ' ').slice(0, 400);
    return out;
  });
  console.log('PAGE:', JSON.stringify(info));

  // 逐帧抓文本
  for (const f of page.frames()) {
    try {
      const t = await f.evaluate(() => document.body ? document.body.innerText.replace(/\s+/g, ' ').slice(0, 200) : '');
      if (t) console.log('FRAME', (f.url() || 'srcdoc').slice(0, 50), '=>', t);
    } catch (e) {}
  }

  await page.screenshot({ path: 'weather-home.png' });
  console.log('NET:', net.length, JSON.stringify([...new Set(net)].slice(0, 10)));
  console.log('LOGS:', JSON.stringify([...new Set(logs)].slice(0, 10)));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
