/* 面板授权管理页改动验证：
   1) 「授权官网」→「官网」，三个外链（官网/功能比较/查看常见问题）统一
      https://store.xuers.dpdns.org/
   2) 输入授权码弹窗去掉底部「还没有授权码？去云端授权中心签发」整行
   静态核对 dist-linux 与 Windows 两份；UI 在本地 3002 headless 登录后验证。
*/
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:3002';
const ROOT = path.join(__dirname, '..');
const DIRS = ['dist-linux', 'sun-panel_v2.0.2-beta261101_windows_amd64'];
const STORE = 'https://store.xuers.dpdns.org/';
const CRED = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist-linux', 'runtime', 'auto_login.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const md5 = s => crypto.createHash('md5').update(s).digest('hex');

(async () => {
  const R = { static: {}, ui: {} };

  /* ---------------- 静态 ---------------- */
  const hashes = {};
  for (const d of DIRS) {
    const lic = fs.readFileSync(path.join(ROOT, d, 'web/assets/index-BXzdvHjD.js'), 'utf8');
    const main = fs.readFileSync(path.join(ROOT, d, 'web/assets/index-C_ye-PI6.js'), 'utf8');
    const ac = fs.readFileSync(path.join(ROOT, d, 'web/custom/auth-center.js'), 'utf8');
    const urls = lic.match(/M\("https?:\/\/[^"]+"\)/g) || [];
    hashes[d] = { custom: md5(ac), lic: md5(lic), main: md5(main) };
    R.static[d] = {
      urls,
      allStore: urls.length === 3 && urls.every(u => u === 'M("' + STORE + '")'),
      noAuthDomainInLic: !lic.includes('auth.xuers.dpdns.org'),
      cnLabelNew: main.includes('goToSunPanelAuthSite:"官网"'),
      cnLabelOld: main.includes('goToSunPanelAuthSite:"授权官网"'),
      noSpFoot: !ac.includes('sp-foot'),
      noFootText: !ac.includes('还没有授权码') && !ac.includes('去云端授权中心'),
      noCloudVar: !ac.includes('CLOUD'),
      matchUpdated: ac.includes('功能比较|官网') && ac.includes('"功能比较", "官网"'),
      noAuthDomainInCustom: !ac.includes('auth.xuers.dpdns.org'),
    };
  }
  R.static.sameHash = hashes[DIRS[0]].custom === hashes[DIRS[1]].custom &&
    hashes[DIRS[0]].lic === hashes[DIRS[1]].lic &&
    hashes[DIRS[0]].main === hashes[DIRS[1]].main;
  R.static.hashes = hashes;

  /* ---------------- UI ---------------- */
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1700, height: 1000 },
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.evaluateOnNewDocument(() => {
    window.__opened = [];
    window.open = function (u) {
      window.__opened.push(String(u));
      return { closed: false, focus() {}, close() {} };
    };
  });

  await p.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 120000 });
  await sleep(2000);
  const inputs = await p.$$('input');
  await inputs[0].type(CRED.username);
  await inputs[1].type(CRED.password);
  await p.keyboard.press('Enter');
  await sleep(6000);

  await p.mouse.click(1640, 43);
  await sleep(1500);
  await p.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && (e.innerText || '').trim() === '系统应用');
    if (el) el.click();
  });
  await sleep(2500);

  const goTab = async (name) => {
    const ok = await p.evaluate((n) => {
      const el = [...document.querySelectorAll('span.ml-2, span')].find(e => (e.innerText || '').trim() === n);
      if (el) { el.click(); return true; }
      return false;
    }, name);
    await sleep(2200);
    return ok;
  };
  R.ui.tabOk = await goTab('授权管理');
  await sleep(1200);

  R.ui.buttons = await p.evaluate(() => [...document.querySelectorAll('button')]
    .map(x => (x.innerText || '').trim())
    .filter(t => ['官网', '功能比较', '查看常见问题', '授权官网', '更换授权码', '使用授权码激活'].includes(t)));

  R.ui.clicked = await p.evaluate(() => {
    const found = [];
    for (const label of ['官网', '功能比较', '查看常见问题']) {
      const btn = [...document.querySelectorAll('button')].find(x => (x.innerText || '').trim() === label);
      if (btn) { btn.click(); found.push(label); }
    }
    return found;
  });
  await sleep(700);
  R.ui.opened = await p.evaluate(() => window.__opened);
  await p.screenshot({ path: path.join(__dirname, 'sp-store-links-page.png') });

  // 打开「输入授权码」弹窗，确认底部红框行已消失且弹窗本身仍完整可用
  R.ui.dialogBtnFound = await p.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(x => /更换授权码|使用授权码激活/.test(x.innerText || ''));
    if (btn) { btn.click(); return true; }
    return false;
  });
  await sleep(1000);
  R.ui.dialog = await p.evaluate(() => {
    const d = document.getElementById('sp-lic-activate-dialog');
    return {
      exists: !!d,
      text: d ? (d.innerText || '').replace(/\s+/g, ' ').trim() : '',
      hasFootText: !!d && /还没有授权码|去云端授权中心/.test(d.innerText || ''),
      hasSpFoot: !!d && !!d.querySelector('.sp-foot'),
      hasInput: !!d && !!d.querySelector('#sp-lic-input'),
      hasActivateBtn: !!d && !!d.querySelector('#sp-lic-ok'),
    };
  });

  await p.screenshot({ path: path.join(__dirname, 'sp-store-links.png') });
  R.ui.errors = errs;

  const s0 = R.static[DIRS[0]], s1 = R.static[DIRS[1]];
  const checks = {
    staticAllStore: s0.allStore && s1.allStore,
    staticNoAuthLic: s0.noAuthDomainInLic && s1.noAuthDomainInLic,
    staticCnLabel: s0.cnLabelNew && !s0.cnLabelOld && s1.cnLabelNew && !s1.cnLabelOld,
    staticNoFoot: s0.noSpFoot && s0.noFootText && s0.noCloudVar && s1.noSpFoot && s1.noFootText && s1.noCloudVar,
    staticMatchUpdated: s0.matchUpdated && s1.matchUpdated,
    staticNoAuthCustom: s0.noAuthDomainInCustom && s1.noAuthDomainInCustom,
    staticSameHash: R.static.sameHash,
    uiNoOldLabel: !R.ui.buttons.includes('授权官网'),
    uiHasNewLabel: R.ui.buttons.includes('官网'),
    uiThreeButtons: ['官网', '功能比较', '查看常见问题'].every(l => R.ui.clicked.includes(l)),
    uiAllStoreUrls: R.ui.opened.length === 3 && R.ui.opened.every(u => u === STORE),
    uiDialogIntact: R.ui.dialogBtnFound && R.ui.dialog.exists && R.ui.dialog.hasInput && R.ui.dialog.hasActivateBtn,
    uiNoFootText: !R.ui.dialog.hasFootText && !R.ui.dialog.hasSpFoot,
    uiNoErrors: errs.length === 0,
  };
  R.checks = checks;
  R.allPass = Object.values(checks).every(Boolean);
  console.log(JSON.stringify(R, null, 1));
  await b.close();
  if (!R.allPass) process.exit(1);
})().catch(e => { console.error('E2E ERROR', e); process.exit(1); });
