/* 授权中心 UI 验证：下拉 4 档 / 未使用灰注销 / 标记已使用后红注销 */
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8791';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SNAP_CARDS = () => [...document.querySelectorAll('#list .lic')].map(el => ({
  name: el.querySelector('.lic-name') ? el.querySelector('.lic-name').textContent.trim() : '',
  tags: [...el.querySelectorAll('.lic-top .tag')].map(t => t.textContent.trim()),
  ops: [...el.querySelectorAll('.lic-ops button')].map(b => ({
    text: b.textContent.trim(), act: b.getAttribute('data-act'), cls: b.className
  }))
}));

(async () => {
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1440, height: 950 }
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1000);
  await p.type('#username', 'admin');
  await p.type('#password', 'Fiery.813');
  await p.click('#loginBtn');
  await sleep(2500);

  const R = {};
  R.login = await p.evaluate(() => ({
    loginHidden: document.getElementById('loginView').hidden,
    appHidden: document.getElementById('appView').hidden,
  }));
  R.select = await p.evaluate(() => [...document.querySelectorAll('#ldur option')]
    .map(o => ({ value: o.value, label: o.textContent.trim(), selected: o.selected })));

  R.cardsBefore = (await p.evaluate(SNAP_CARDS)).slice(0, 4);

  const blocked = await p.$('button[data-act="revokeBlocked"]');
  if (blocked) { await blocked.click(); await sleep(700); }
  R.blockedToastShown = await p.evaluate(() =>
    document.body.innerText.indexOf('未使用的授权码不能注销') !== -1);

  const mark = await p.$('button[data-act="markUsed"]');
  if (mark) { await mark.click(); await sleep(1300); }
  R.cardsAfterMark = (await p.evaluate(SNAP_CARDS))
    .filter(c => c.name.indexOf('验证') === 0).slice(0, 3);

  R.errors = errs;
  await p.screenshot({ path: 'lc-v3-ui.png', fullPage: true });
  console.log(JSON.stringify(R, null, 1));
  await b.close();
})();
