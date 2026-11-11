/* 本地验证：卡片标题默认隐藏 + 个性化设置里的「显示卡片标题」开关 + 持久化 */
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CRED = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dist-linux', 'runtime', 'auto_login.json'), 'utf8'));
const BASE = process.env.BASE || 'http://127.0.0.1:3002';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function SNAP() {
  const visible = sel => [...document.querySelectorAll(sel)]
    .filter(e => getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden').length;
  const sw = document.querySelector('.n-switch[data-sp-card-title-switch]');
  const row = sw ? sw.closest('.flex.items-center') : null;
  return {
    hiddenClass: document.documentElement.classList.contains('sp-hide-card-titles'),
    ls: localStorage.getItem('sp_hide_card_titles'),
    cardTitles: document.querySelectorAll('.item-card-title').length,
    cardTitlesVisible: visible('.item-card-title'),
    groupTitles: document.querySelectorAll('.item-card-group-title-title').length,
    groupTitlesVisible: visible('.item-card-group-title-title'),
    innerNames: document.querySelectorAll('.font-semibold').length,
    switchInjected: !!row,
    switchCount: document.querySelectorAll('.n-switch[data-sp-card-title-switch]').length,
    switchLabel: row ? ((row.querySelector('span') || {}).textContent || '') : null,
    switchChecked: sw ? sw.getAttribute('aria-checked') : null
  };
}

async function openPersonal(p) {
  await p.mouse.click(1640, 43); await sleep(1200);
  await p.evaluate(() => {
    const e = [...document.querySelectorAll('*')].find(x => x.children.length === 0 && (x.innerText || '').trim() === '系统应用');
    if (e) e.click();
  });
  await sleep(1600);
  await p.evaluate(() => {
    const e = [...document.querySelectorAll('*')].find(x => x.children.length === 0 && (x.innerText || '').trim() === '个性化设置');
    if (e) e.click();
  });
  await sleep(2200);
}

(async () => {
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1700, height: 1000 }
  });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e).slice(0, 200)));

  await p.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1200);
  const inp = await p.$$('input');
  await inp[0].type(CRED.username);
  await inp[1].type(CRED.password);
  await p.keyboard.press('Enter');
  await sleep(3500);

  const R = {};
  R['1_首页_默认'] = await p.evaluate(SNAP);
  await p.screenshot({ path: 'ct-1-default.png' });

  await openPersonal(p);
  R['2_设置面板'] = await p.evaluate(SNAP);
  await p.screenshot({ path: 'ct-2-settings.png' });

  // 打开「显示卡片标题」-> 标题恢复
  await p.evaluate(() => { const s = document.querySelector('.n-switch[data-sp-card-title-switch]'); if (s) s.click(); });
  await sleep(900);
  R['3_打开开关后'] = await p.evaluate(SNAP);

  await p.reload({ waitUntil: 'networkidle2', timeout: 60000 }); await sleep(2500);
  R['4_刷新后保持显示'] = await p.evaluate(SNAP);

  // 再关掉 -> 回到隐藏
  await openPersonal(p);
  await p.evaluate(() => { const s = document.querySelector('.n-switch[data-sp-card-title-switch]'); if (s) s.click(); });
  await sleep(900);
  R['5_关闭开关后'] = await p.evaluate(SNAP);
  await p.screenshot({ path: 'ct-5-hidden.png' });

  await p.reload({ waitUntil: 'networkidle2', timeout: 60000 }); await sleep(2500);
  R['6_刷新后保持隐藏'] = await p.evaluate(SNAP);

  R.errors = errors;
  console.log(JSON.stringify(R, null, 1));
  await b.close();
})();
