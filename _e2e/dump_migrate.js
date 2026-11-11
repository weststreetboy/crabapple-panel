const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:3002';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1700, height: 1000 },
  });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/MicroAppApi|ERR_NAME_NOT_RESOLVED/.test(m.text())) console.log('[console]', m.text().slice(0, 160)); });

  await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 120000 });
  await sleep(1500);
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc');
  await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter');
  await sleep(6000);

  await page.mouse.click(1640, 43);
  await sleep(1500);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && (e.innerText || '').trim() === '系统应用');
    if (el) el.click();
  });
  await sleep(2500);

  const goTab = async (name) => {
    const ok = await page.evaluate((n) => {
      const el = [...document.querySelectorAll('span.ml-2, span')].find(e => (e.innerText || '').trim() === n);
      if (el) { el.click(); return true; }
      return false;
    }, name);
    await sleep(2500);
    return ok;
  };

  console.log('切到迁移:', await goTab('迁移'));
  await sleep(1500);

  const info = await page.evaluate(() => {
    // 找包含“备份”文字的按钮，并向上追溯容器
    const btn = [...document.querySelectorAll('button')].find(b => /备份/.test(b.innerText || ''));
    let chain = [];
    let node = btn ? btn.closest('[class]') : null;
    for (let i = 0; i < 8 && node; i++) {
      chain.push(node.tagName + '.' + (node.className || '').toString().split(/\s+/).slice(0,3).join('.'));
      node = node.parentElement;
    }
    // 主内容区：含“备份”或“恢复”的最近有 class 的祖先
    const root = btn ? btn.closest('.n-card, [class*="card"], [class*="page"], [class*="content"], [class*="migrate"], [class*="setting"]') : null;
    return {
      bodyHasBackup: document.body.innerText.includes('备份'),
      bodyHasRecovery: document.body.innerText.includes('恢复'),
      btnText: btn ? (btn.innerText || '').replace(/\s+/g,' ').trim() : null,
      btnChain: chain,
      rootHTML: root ? root.outerHTML.slice(0, 1200) : null,
      // 整个路由视图结构
      appChildren: [...document.querySelectorAll('#app > *')].map(e => e.tagName + '.' + (e.className||'').toString().split(/\s+/).slice(0,2).join('.')),
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: path.join(__dirname, 'shot-dump-migrate.png') });

  // 再找“没有PRO授权”附近的结构
  const proInfo = await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(e => (e.innerText||'').includes('没有PRO') || (e.innerText||'').includes('没有 PRO'));
    if (!el) return { found: false };
    const parent = el.closest('[class]');
    return { found: true, text: (el.innerText||'').slice(0,120), parentTag: parent ? parent.tagName + '.' + (parent.className||'').toString().split(/\s+/).slice(0,3).join('.') : null };
  });
  console.log('PRO:', JSON.stringify(proInfo));

  await browser.close();
})();
