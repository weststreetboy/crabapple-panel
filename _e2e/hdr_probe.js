const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'https://daye-nav.app.workbuddy.host';
const SC = '?sharecode=TBMY3RYXH3';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'], defaultViewport:{width:1440,height:900} });
  const page = await browser.newPage();
  const out = [];
  page.on('request', r => {
    if (/templateProxy|dataNode/.test(r.url())) out.push({ url: r.url().replace(BASE,''), headers: r.headers(), body: (r.postData()||'').slice(0,160) });
  });
  await page.goto(BASE + '/login' + SC, { waitUntil:'networkidle2', timeout:90000 });
  await sleep(1500);
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc'); await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter'); await sleep(4500);
  await page.goto(BASE + '/' + SC, { waitUntil:'networkidle2', timeout:60000 });
  await sleep(9000);
  for (const o of out.slice(0, 6)) console.log(JSON.stringify(o));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
