const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:3099';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('console', m => { const t = m.text(); if (/error|fail/i.test(t)) errs.push(t.slice(0,160)); });
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message.slice(0,160)));

  // 登录
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1200));
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc');
  await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 3500));

  // 进入启动器（点右上角头像/菜单后找启动器，或直接访问根）
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2500));

  // 等待时钟出现
  await page.waitForSelector('.clock-time', { timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

  const info = await page.evaluate(() => {
    const ct = document.querySelector('.clock-time');
    const shotBox = document.querySelector('.sp-shot');
    if (!ct) return { found: false };
    const cs = getComputedStyle(ct);
    return {
      found: true,
      hasClass: ct.classList.contains('sp-clock-neon'),
      text: ct.textContent.trim(),
      dataSpclock: ct.getAttribute('data-spclock'),
      color: cs.color,
      webkitTextStrokeWidth: cs.webkitTextStrokeWidth,
      webkitTextStrokeColor: cs.webkitTextStrokeColor,
      textShadow: cs.textShadow.slice(0, 200),
      fontFamily: cs.fontFamily.slice(0, 60),
      viewfinderRemoved: !shotBox,
    };
  });

  // 截时钟区域
  const shot = await page.evaluate(() => {
    const c = document.querySelector('.clock');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  let clip = null;
  if (shot) {
    clip = {
      x: Math.max(0, shot.x - 10),
      y: Math.max(0, shot.y - 10),
      width: Math.min(1440, shot.width + 20),
      height: Math.min(900, shot.height + 20),
    };
  }
  await page.screenshot({ path: 'C:/Users/Administrator/WorkBuddy/2026-11-04-11-22-34/sun-panel/_e2e/clock-neon.png', clip: clip || undefined });

  console.log('VIEWFINDER_REMOVED=' + (info.viewfinderRemoved === true));
  console.log('INFO ' + JSON.stringify(info, null, 2));
  console.log('CLIP ' + JSON.stringify(clip));
  console.log('ERRORS ' + errs.length + ' :: ' + errs.slice(0, 8).join(' | '));

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
