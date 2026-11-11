const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:3002';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'], defaultViewport:{width:1500,height:1000} });
  const page = await browser.newPage();
  page.on('dialog', async d => { await d.accept(); });
  const log = [];
  page.on('response', async r => {
    const u = r.url();
    if (u.includes('/api/')) {
      let t = ''; try { t = await r.text(); } catch (e) {}
      log.push({ status: r.status(), url: u.replace(BASE, ''), body: t.slice(0, 700) });
    }
  });
  await page.goto(BASE + '/login', { waitUntil:'networkidle2', timeout:90000 });
  await sleep(1500);
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc'); await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter'); await sleep(4500);
  await page.mouse.click(1457, 43); await sleep(1500);
  const clickText = t => page.evaluate((x)=>{const els=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.innerText||'').trim()===x);if(!els.length)return false;els[0].click();return true;}, t);
  await clickText('图库');
  await sleep(4000);
  for (const e of log) console.log('###', e.status, e.url, '\n    ', e.body.replace(/\s+/g,' '));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
