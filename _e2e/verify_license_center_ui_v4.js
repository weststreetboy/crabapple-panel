/* 授权中心 v4 UI 验证：设置入口移入用户区 + 头像上传
   1) 左侧 nav 只剩「授权管理」，不再有独立「设置」菜单
   2) 点左下角用户卡片进设置页，active 高亮正确；点回授权管理能切回
   3) 合成一张 120x80 PNG 塞进 #avatarFile，走真实 FileReader/Image/canvas 流程
   4) 上传后左下角头像与设置页预览框都变成 img，刷新后保持
   5) 清除后回退到首字母「A」与「未设置」，刷新后仍为空
   6) 无 pageerror / console error
*/
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8791';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1440, height: 950 }
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });

  const R = {};
  await p.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(800);

  R.scriptSrc = await p.evaluate(() => {
    const s = document.querySelector('script[src*="app.js"]');
    return s ? s.getAttribute('src') : '';
  });

  await p.type('#username', 'admin');
  await p.type('#password', 'Fiery.813');
  await p.click('#loginBtn');
  await sleep(2200);

  R.login = await p.evaluate(() => ({
    loginHidden: document.getElementById('loginView').hidden,
    appHidden: document.getElementById('appView').hidden,
    navItems: document.querySelectorAll('.nav .nav-item').length,
    navTexts: [...document.querySelectorAll('.nav .nav-item')].map(e => e.textContent.trim()),
    whoEntryExists: !!document.getElementById('whoEntry'),
    whoEntryView: document.getElementById('whoEntry') && document.getElementById('whoEntry').getAttribute('data-view'),
  }));

  R.initialAvatar = await p.evaluate(() => ({
    whoHasImg: !!document.querySelector('#whoAvt img'),
    whoText: document.getElementById('whoAvt').textContent.trim(),
    previewHasImg: !!document.querySelector('#avatarPreview img'),
    previewText: document.getElementById('avatarPreview').textContent.trim(),
  }));

  // 点用户卡片 → 设置页
  await p.click('#whoEntry');
  await sleep(500);
  R.afterUserClick = await p.evaluate(() => ({
    setVisible: !document.getElementById('viewSet').hidden,
    licHidden: document.getElementById('viewLic').hidden,
    pageTitle: document.getElementById('pageTitle').textContent.trim(),
    whoActive: document.getElementById('whoEntry').classList.contains('active'),
    navActive: document.querySelector('.nav .nav-item').classList.contains('active'),
    avatarRowVisible: !!document.getElementById('avatarPreview').offsetParent,
  }));

  // 点回授权管理
  await p.click('.nav .nav-item');
  await sleep(400);
  R.backToLic = await p.evaluate(() => ({
    licVisible: !document.getElementById('viewLic').hidden,
    navActive: document.querySelector('.nav .nav-item').classList.contains('active'),
    whoActive: document.getElementById('whoEntry').classList.contains('active'),
  }));

  await p.click('#whoEntry');
  await sleep(400);

  // 合成 120x80 图片塞进 file input（非正方形，顺便验证居中方形裁剪）
  await p.evaluate(() => {
    const cv = document.createElement('canvas');
    cv.width = 120; cv.height = 80;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#5078f0'; ctx.fillRect(0, 0, 120, 80);
    const dataUrl = cv.toDataURL('image/png');
    const bin = atob(dataUrl.split(',')[1]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'avatar.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const inp = document.getElementById('avatarFile');
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(1600);

  R.afterUpload = await p.evaluate(() => {
    const who = document.getElementById('whoAvt');
    const box = document.getElementById('avatarPreview');
    const img = who.querySelector('img');
    const src = img ? img.getAttribute('src') : '';
    return {
      whoHasImg: !!img,
      whoSrc: src.slice(0, 22),
      whoIsSquareReady: src.startsWith('data:image/png'),
      previewHasImg: !!box.querySelector('img'),
      toast: document.getElementById('toast').textContent.trim(),
    };
  });

  await p.reload({ waitUntil: 'networkidle2' });
  await sleep(1800);
  R.afterReload = await p.evaluate(() => ({
    loggedIn: !document.getElementById('appView').hidden,
    whoHasImg: !!document.querySelector('#whoAvt img'),
  }));

  // 清除头像
  await p.click('#whoEntry');
  await sleep(400);
  await p.evaluate(() => document.getElementById('clearAvatar').click());
  await sleep(1200);
  R.afterClear = await p.evaluate(() => ({
    whoHasImg: !!document.querySelector('#whoAvt img'),
    whoText: document.getElementById('whoAvt').textContent.trim(),
    previewHasImg: !!document.querySelector('#avatarPreview img'),
    previewText: document.getElementById('avatarPreview').textContent.trim(),
    toast: document.getElementById('toast').textContent.trim(),
  }));

  await p.reload({ waitUntil: 'networkidle2' });
  await sleep(1500);
  R.afterReload2 = await p.evaluate(() => ({
    loggedIn: !document.getElementById('appView').hidden,
    whoHasImg: !!document.querySelector('#whoAvt img'),
  }));

  await p.screenshot({ path: 'lc-v4-ui.png', fullPage: true });
  R.errors = errs;

  const checks = {
    scriptV5: R.scriptSrc === '/app.js?v=5',
    login: R.login.loginHidden && !R.login.appHidden,
    navOnlyOne: R.login.navItems === 1,
    navText: R.login.navTexts[0] === '授权管理',
    whoEntryIsSet: R.login.whoEntryExists && R.login.whoEntryView === 'set',
    initialNoAvatar: !R.initialAvatar.whoHasImg && R.initialAvatar.whoText === 'A' && !R.initialAvatar.previewHasImg,
    userClickOpensSet: R.afterUserClick.setVisible && R.afterUserClick.licHidden &&
      R.afterUserClick.whoActive && !R.afterUserClick.navActive && R.afterUserClick.avatarRowVisible,
    backToLic: R.backToLic.licVisible && R.backToLic.navActive && !R.backToLic.whoActive,
    uploadShowsImg: R.afterUpload.whoHasImg && R.afterUpload.previewHasImg && R.afterUpload.whoIsSquareReady,
    reloadPersist: R.afterReload.loggedIn && R.afterReload.whoHasImg,
    cleared: !R.afterClear.whoHasImg && !R.afterClear.previewHasImg && R.afterClear.whoText === 'A',
    reloadClearPersist: R.afterReload2.loggedIn && !R.afterReload2.whoHasImg,
    noErrors: errs.length === 0,
  };
  R.checks = checks;
  R.allPass = Object.values(checks).every(Boolean);
  console.log(JSON.stringify(R, null, 1));
  await b.close();
  if (!R.allPass) process.exit(1);
})().catch(e => { console.error('E2E ERROR', e); process.exit(1); });
