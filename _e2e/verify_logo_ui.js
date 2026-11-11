const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'https://daye-nav.app.workbuddy.host';
const SC = '?sharecode=TBMY3RYXH3';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'], defaultViewport:{width:1500,height:1000} });
  const page = await browser.newPage();
  page.on('dialog', async d => { await d.accept(); });
  const trace = [];
  page.on('response', async r => {
    const u = r.url();
    if (/uploadImg|saveSiteSetting/.test(u)) { let t=''; try{t=(await r.text()).slice(0,180);}catch(e){} trace.push(r.status()+' '+u.split('/api')[1]+' '+t); }
  });

  await page.goto(BASE + '/login' + SC, { waitUntil:'networkidle2', timeout:90000 });
  await sleep(1500);
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc'); await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter'); await sleep(4500);
  await page.mouse.click(1457, 43); await sleep(1200);
  await page.evaluate(()=>{const e=[...document.querySelectorAll('*')].filter(x=>x.children.length===0&&(x.innerText||'').trim()==='全局设置');e[0].click();});
  await sleep(2500);

  // 真实用户路径：点“上传ICO图像” → 文件选择器
  const [chooser] = await Promise.all([
    page.waitForFileChooser({ timeout: 15000 }),
    page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && (e.innerText || '').trim() === '上传ICO图像')[0];
      if (!el) throw new Error('no trigger');
      el.click();
    }),
  ]);
  await chooser.accept([path.resolve('test-logo.ico')]);
  await sleep(5000);
  console.log('TRACE after pick', JSON.stringify(trace, null, 1));

  // 保存
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].filter(x => (x.innerText || '').trim() === '保存');
    b[0].click();
  });
  await sleep(3500);
  const toast = await page.evaluate(() => document.body.innerText.replace(/\s+/g,' ').match(/保存成功|保存失败/g));
  console.log('TOAST', JSON.stringify(toast));
  console.log('TRACE final', JSON.stringify(trace.slice(-3), null, 1));
  await page.screenshot({ path: 'logo-ui.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
