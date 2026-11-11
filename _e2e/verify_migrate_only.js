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
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 160)));
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

  const mInfo = await page.evaluate(() => {
    const card = document.querySelector('[data-sp-restore-card]');
    const body = (function(){
      var b = [...document.querySelectorAll('.n-card')].filter(c => (c.innerText||'').trim() === '备份')[0];
      var r = [...document.querySelectorAll('.n-card')].filter(c => (c.innerText||'').trim() === '恢复')[0];
      if (!b || !r) return null;
      var p = b.parentElement;
      return (p && p.contains(r)) ? p : null;
    })();
    return {
      migrateBodyOk: !!body,
      hasRestoreCard: !!card,
      restoreCardText: card ? card.innerText.replace(/\s+/g,' ').trim().slice(0,90) : null,
      hasRefreshBtn: !!(card && card.querySelector('[data-sp-refresh-backup]')),
      hasList: !!(card && card.querySelector('[data-sp-restore-list]')),
      leftoverGear: !!document.querySelector('.sp-feat'),
      // 弹窗标题
      modalTitle: (function(){
        var h = [...document.querySelectorAll('*')].find(e => (e.innerText||'').trim() === '系统应用 / 迁移' && e.children.length===0);
        return h ? 'found' : 'missing';
      })(),
    };
  });
  console.log('迁移弹窗:', JSON.stringify(mInfo, null, 1));
  await page.screenshot({ path: path.join(__dirname, 'shot-verify-migrate2.png') });

  // 测试刷新按钮是否存在且可点（即便无备份，列表应显示「服务器上暂无备份文件」或「加载中」）
  await browser.close();
})();
