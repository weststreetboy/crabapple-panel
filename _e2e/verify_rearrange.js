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

  // 打开头像菜单，看菜单项
  await page.mouse.click(1640, 43);
  await sleep(1500);
  const menu = await page.evaluate(() => [...document.querySelectorAll('*')]
    .filter(e => e.children.length === 0 && (e.innerText||'').trim().length > 0 && (e.innerText||'').trim().length < 20)
    .map(e => (e.innerText||'').trim())
    .filter(t => /设置|个性化|系统|授权|应用|退出|账号|主题/.test(t)));
  console.log('菜单项:', JSON.stringify(menu));

  const openedPersonal = await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && (e.innerText||'').trim() === '个性化设置');
    if (el) { el.click(); return true; }
    return false;
  });
  console.log('点击个性化设置:', openedPersonal);
  await sleep(2800);

  const sInfo = await page.evaluate(() => {
    const hover = document.querySelector('[data-sp-hover-card]');
    const rain = document.querySelector('[data-sp-rain-card]');
    const gear = document.querySelector('.sp-dock, .sp-feat');
    return {
      hasHoverCard: !!hover,
      hoverText: hover ? hover.innerText.replace(/\s+/g,' ').trim().slice(0,50) : null,
      hasRainCard: !!rain,
      rainText: rain ? rain.innerText.replace(/\s+/g,' ').trim().slice(0,50) : null,
      // 雨效分段按钮
      rainSegOk: !!(rain && rain.querySelector('[data-sp-rain-seg] button[data-v="auto"]')),
      hoverSegOk: !!(hover && hover.querySelector('[data-sp-hover-seg] button[data-v="glow"]')),
      leftoverGear: !!gear,
    };
  });
  console.log('个性化设置:', JSON.stringify(sInfo, null, 1));
  await page.screenshot({ path: path.join(__dirname, 'shot-verify-settings.png') });

  // 关闭对话框：按 Escape
  await page.keyboard.press('Escape');
  await sleep(1000);

  // 打开迁移弹窗
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
      restoreCardText: card ? card.innerText.replace(/\s+/g,' ').trim().slice(0,80) : null,
      hasRefreshBtn: !!(card && card.querySelector('[data-sp-refresh-backup]')),
      hasList: !!(card && card.querySelector('[data-sp-restore-list]')),
      // 确认没有遗留的齿轮弹层
      leftoverGear: !!document.querySelector('.sp-feat'),
    };
  });
  console.log('迁移弹窗:', JSON.stringify(mInfo, null, 1));
  await page.screenshot({ path: path.join(__dirname, 'shot-verify-migrate.png') });

  await browser.close();
})();
