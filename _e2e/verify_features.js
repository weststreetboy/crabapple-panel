/* 本地 3002 端到端验证：白昼/夜间遮罩 + 雨效 + 悬停效果 + 万能窗口 + 时钟截图框 */
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:3002';
const CRED = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dist-linux', 'runtime', 'auto_login.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const R = { checks: {}, ui: {}, errors: [] };
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1700, height: 1000 },
  });
  const p = await b.newPage();
  p.on('pageerror', e => R.errors.push(String(e).slice(0, 160)));
  p.on('console', m => { if (m.type() === 'error') R.errors.push('console:' + m.text().slice(0, 120)); });

  // 强制雨效为「开」，便于验证雨 canvas
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('sp_rain_mode', 'on'); } catch (e) {} });

  await p.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1200);
  const i = await p.$$('input');
  await i[0].type(CRED.username);
  await i[1].type(CRED.password);
  await p.keyboard.press('Enter');
  await sleep(3500);

  // 1) 遮罩 + 雨效 + 悬停默认值
  R.ui = await p.evaluate(() => {
    const f = window.__spFeat || {};
    const mask = document.querySelector('.sp-dn-mask');
    const rain = document.querySelector('.sp-rain');
    return {
      dayNight: f.dayNight,
      maskClass: mask ? mask.className : null,
      hoverDefault: f.hover,
      bodyHoverClass: document.body.className.match(/sp-hov-\w+/) ? document.body.className.match(/sp-hov-\w+/)[0] : null,
      rainOn: !!(rain && rain.classList.contains('sp-on')),
      rainDrops: f.rainDrops,
      dockPresent: !!document.querySelector('.sp-dock'),
      featPanelPresent: !!document.querySelector('.sp-feat'),
      uniMaskPresent: !!document.querySelector('.sp-uni-mask'),
    };
  });
  R.checks.maskExists = !!R.ui.maskClass;
  R.checks.dayNightCorrect = R.ui.dayNight === 'day'; // 当前 10 点 => 白天
  R.checks.rainOnWhenForced = R.ui.rainOn;
  R.checks.rainDropsPositive = R.ui.rainDrops > 0;
  R.checks.hoverDefaultScale = R.ui.hoverDefault === 'scale' && R.ui.bodyHoverClass === 'sp-hov-scale';
  R.checks.dockPresent = R.ui.dockPresent;
  R.checks.featPanelPresent = R.ui.featPanelPresent;
  R.checks.uniMaskPresent = R.ui.uniMaskPresent;

  await p.screenshot({ path: path.join(__dirname, 'feat-home.png') });

  // 2) 齿轮弹层 + 悬停切换到 glow + 雨效切到 off/on
  await p.click('#spBtnGear');
  await sleep(400);
  R.checks.popoverShown = await p.evaluate(() => document.querySelector('.sp-feat').classList.contains('sp-show'));
  // 选「发光」
  await p.evaluate(() => { const b = [...document.querySelectorAll('#spHoverSeg button')].find(x => x.dataset.v === 'glow'); b.click(); });
  await sleep(200);
  R.checks.hoverSwitchedToGlow = await p.evaluate(() => document.body.classList.contains('sp-hov-glow'));
  // 雨效切到 off
  await p.evaluate(() => { const b = [...document.querySelectorAll('#spRainSeg button')].find(x => x.dataset.v === 'off'); b.click(); });
  await sleep(200);
  R.checks.rainOffWorks = await p.evaluate(() => !(document.querySelector('.sp-rain').classList.contains('sp-on')));
  // 雨效切回 on
  await p.evaluate(() => { const b = [...document.querySelectorAll('#spRainSeg button')].find(x => x.dataset.v === 'on'); b.click(); });
  await sleep(200);
  R.checks.rainOnWorks = await p.evaluate(() => document.querySelector('.sp-rain').classList.contains('sp-on'));
  await p.screenshot({ path: path.join(__dirname, 'feat-popover.png') });
  await p.click('#spBtnGear'); // 关闭弹层
  await sleep(200);

  // 3) 万能窗口：打开 -> 输入 URL -> 打开 -> 切手机视角 -> 刷新 -> 新窗口
  await p.click('#spBtnUni');
  await sleep(300);
  R.checks.uniOpen = await p.evaluate(() => document.querySelector('.sp-uni-mask').classList.contains('sp-show'));
  await p.type('#spUniUrl', 'example.com');
  await p.click('#spUniGo');
  await sleep(1500);
  R.ui.uniIframeSrc = await p.evaluate(() => document.querySelector('#spUniFrame').getAttribute('src'));
  R.checks.uniIframeSrc = /example\.com/.test(R.ui.uniIframeSrc || '');
  // 手机视角
  await p.click('#spUniView');
  await sleep(300);
  R.checks.uniMobile = await p.evaluate(() => document.querySelector('#spUniStage').classList.contains('sp-mobile'));
  // 刷新（重新赋值 src）
  const before = await p.evaluate(() => document.querySelector('#spUniFrame').getAttribute('src'));
  await p.click('#spUniRefresh');
  await sleep(300);
  const after = await p.evaluate(() => document.querySelector('#spUniFrame').getAttribute('src'));
  R.ui.refreshBefore = before;
  R.ui.refreshAfter = after;
  R.checks.uniRefresh = /example\.com/.test(before || '') && /example\.com/.test(after || '') &&
    before.replace(/\/$/, '') === after.replace(/\/$/, '');
  // 新窗口（拦截 window.open）
  await p.evaluate(() => { window.__opened = []; const o = window.open; window.open = function (u) { window.__opened.push(String(u)); return null; }; });
  await p.click('#spUniNew');
  await sleep(200);
  R.checks.uniNewWindow = await p.evaluate(() => (window.__opened || []).some(u => u.indexOf('example.com') >= 0));
  await p.screenshot({ path: path.join(__dirname, 'feat-uni-mobile.png') });
  // 关闭万能窗口，再截一张 PC 视角
  await p.click('#spUniView');
  await sleep(200);
  await p.evaluate(() => { document.querySelector('#spUniClose').click(); });
  await sleep(200);
  R.checks.uniClosed = await p.evaluate(() => !document.querySelector('.sp-uni-mask').classList.contains('sp-show'));

  // 4) 时钟截图框：存在、已显示、且覆盖在 .clock 上方
  R.checks.clockShot = await p.evaluate(() => {
    const shot = document.querySelector('.sp-shot');
    const clk = document.querySelector('.clock');
    if (!shot || !clk) return { on: false, overlap: false };
    const on = shot.classList.contains('sp-on');
    const s = shot.getBoundingClientRect(), c = clk.getBoundingClientRect();
    const overlap = !(s.right < c.left || s.left > c.right || s.bottom < c.top || s.top > c.bottom);
    return { on, overlap, hasCorners: shot.querySelectorAll('.sp-corner').length === 4, hasRec: !!shot.querySelector('.sp-rec') };
  });

  R.allPass = Object.keys(R.checks).every(k => {
    var v = R.checks[k];
    if (v === true) return true;
    if (v && typeof v === 'object') return Object.values(v).every(Boolean);
    return false;
  });
  console.log(JSON.stringify(R, null, 1));
  await b.close();
})();
