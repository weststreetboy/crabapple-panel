/* 发布后线上双站验证：授权中心（下拉/使用状态/注销门禁）+ 面板（标题隐藏/无开关） */
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CRED = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dist-linux', 'runtime', 'auto_login.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1700, height: 1000 }
  });
  const R = {}, errs = [];

  // ---------- 授权中心 ----------
  const lc = await b.newPage();
  lc.on('pageerror', e => errs.push('lc:' + String(e).slice(0, 140)));
  await lc.goto('https://auth.xuers.dpdns.org/', { waitUntil: 'networkidle2', timeout: 120000 });
  await sleep(1500);
  await lc.type('#username', 'admin');
  await lc.type('#password', 'Fiery.813');
  await lc.click('#loginBtn');
  await sleep(3500);
  R.lc = await lc.evaluate(() => {
    const s = document.querySelector('script[src*="/app.js"]');
    return {
      loggedIn: !!document.getElementById('appView') && !document.getElementById('appView').hidden,
      scriptSrc: s ? s.getAttribute('src') : '',
      options: [...document.querySelectorAll('#ldur option')].map(o => ({ v: o.value, t: o.textContent.trim(), sel: o.selected })),
      cards: [...document.querySelectorAll('#list .lic')].slice(0, 5).map(el => ({
        name: (el.querySelector('.lic-name') || {}).textContent || '',
        tags: [...el.querySelectorAll('.lic-top .tag')].map(t => t.textContent.trim()),
        acts: [...el.querySelectorAll('.lic-ops button')].map(x => x.getAttribute('data-act'))
      }))
    };
  });
  await lc.screenshot({ path: 'live-lc-v3.png' });

  // ---------- 面板 ----------
  const sp = await b.newPage();
  sp.on('pageerror', e => errs.push('sp:' + String(e).slice(0, 140)));
  await sp.goto('https://daye-nav.app.workbuddy.host/?sharecode=TBMY3RYXH3', { waitUntil: 'networkidle2', timeout: 120000 });
  await sleep(2500);
  if (/login/.test(sp.url())) {
    const i = await sp.$$('input');
    await i[0].type(CRED.username);
    await i[1].type(CRED.password);
    await sp.keyboard.press('Enter');
    await sleep(6000);
  }
  R.spHome = await sp.evaluate(() => {
    const vis = s => [...document.querySelectorAll(s)]
      .filter(e => getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden').length;
    return {
      url: location.href,
      cardTitles: document.querySelectorAll('.item-card-title').length,
      cardTitlesVisible: vis('.item-card-title'),
      groupTitlesVisible: vis('.item-card-group-title-title'),
      innerNames: document.querySelectorAll('.font-semibold').length,
      switchText: document.body.innerText.indexOf('显示卡片标题') !== -1
    };
  });
  await sp.mouse.click(1640, 43); await sleep(1200);
  await sp.evaluate(() => {
    const e = [...document.querySelectorAll('*')].find(x => x.children.length === 0 && (x.innerText || '').trim() === '系统应用');
    if (e) e.click();
  });
  await sleep(1600);
  await sp.evaluate(() => {
    const e = [...document.querySelectorAll('*')].find(x => x.children.length === 0 && (x.innerText || '').trim() === '个性化设置');
    if (e) e.click();
  });
  await sleep(2200);
  R.spSettings = await sp.evaluate(() => ({
    switchLabels: [...document.querySelectorAll('*')]
      .filter(e => e.children.length === 0 && (e.textContent || '').trim() === '显示卡片标题').length,
    switchNodes: document.querySelectorAll('.n-switch[data-sp-card-title-switch]').length,
    nativeSwitches: document.querySelectorAll('.n-switch').length
  }));
  await sp.screenshot({ path: 'live-sp-v3.png' });

  R.errors = errs;
  console.log(JSON.stringify(R, null, 1));
  await b.close();
})();
