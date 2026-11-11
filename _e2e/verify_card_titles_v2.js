/* 面板验证：卡片标题仍隐藏、分组标题保留、设置里已无「显示卡片标题」开关 */
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CRED = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dist-linux', 'runtime', 'auto_login.json'), 'utf8'));
const BASE = process.env.BASE || 'http://127.0.0.1:3002';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function SNAP() {
  const vis = s => [...document.querySelectorAll(s)]
    .filter(e => getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden').length;
  return {
    cardTitles: document.querySelectorAll('.item-card-title').length,
    cardTitlesVisible: vis('.item-card-title'),
    groupTitlesVisible: vis('.item-card-group-title-title'),
    innerNames: document.querySelectorAll('.font-semibold').length,
    titleTextOnPage: document.body.innerText.indexOf('显示卡片标题') !== -1
  };
}

(async () => {
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1700, height: 1000 }
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1200);
  const i = await p.$$('input');
  await i[0].type(CRED.username);
  await i[1].type(CRED.password);
  await p.keyboard.press('Enter');
  await sleep(3500);

  const R = {};
  R.home = await p.evaluate(SNAP);

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
  R.settings = await p.evaluate(() => ({
    switchLabels: [...document.querySelectorAll('*')]
      .filter(e => e.children.length === 0 && (e.textContent || '').trim() === '显示卡片标题').length,
    switchNodes: document.querySelectorAll('.n-switch[data-sp-card-title-switch]').length,
    switchCountTotal: document.querySelectorAll('.n-switch').length
  }));
  await p.screenshot({ path: 'ct-v2-settings.png' });
  R.errors = errs;
  console.log(JSON.stringify(R, null, 1));
  await b.close();
})();
