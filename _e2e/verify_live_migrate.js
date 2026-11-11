const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'https://daye-nav.app.workbuddy.host';
const SC = '?sharecode=TBMY3RYXH3';
const CRED = { username: 'admin@sun.cc', password: '12345678' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args:['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'], defaultViewport:{width:1700,height:1000} });
  const page = await browser.newPage();
  await page.goto(BASE + '/' + SC, { waitUntil: 'networkidle2', timeout: 150000 });
  await sleep(2500);
  const inputs = await page.$$('input');
  if (inputs.length >= 2) {
    await inputs[0].type(CRED.username);
    await inputs[1].type(CRED.password);
    await sleep(400);
    await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/登录|Login/i.test(x.innerText||'')); if(b)b.click(); });
    await sleep(6000);
  }
  await page.mouse.click(1640, 43);
  await sleep(1500);
  await page.evaluate(() => { const el=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&(e.innerText||'').trim()==='系统应用'); if(el)el.click(); });
  await sleep(3500);

  const sysInfo = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('div, span')].filter(e => e.children.length === 0 && /迁移|备份|恢复|授权|设置|PRO|pro/i.test((e.innerText||'').trim())).map(e => (e.innerText||'').trim());
    const bodyTxt = document.body.innerText.replace(/\n+/g,' | ').slice(0, 300);
    return { tabs: [...new Set(tabs)], bodyTxt };
  });
  console.log('SYSAPP:', JSON.stringify(sysInfo, null, 1));
  await page.screenshot({ path: path.join(__dirname, 'live-sysapp.png') });

  // try to open 迁移 by clicking any element exactly "迁移"
  const clicked = await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && (e.innerText||'').trim() === '迁移');
    if (el) { el.click(); return true; }
    return false;
  });
  await sleep(3000);
  const migState = await page.evaluate(() => ({
    hasRestoreCard: !!document.querySelector('[data-sp-restore-card]'),
    restoreText: document.body.innerText.includes('数据恢复（服务器已有备份）'),
    bodyTxt: document.body.innerText.replace(/\n+/g,' | ').slice(0, 260),
  }));
  console.log('MIGRATE clicked=', clicked, JSON.stringify(migState));
  await page.screenshot({ path: path.join(__dirname, 'live-migrate-dbg.png') });
  await browser.close();
})();
