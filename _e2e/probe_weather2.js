const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'https://daye-nav.app.workbuddy.host';
const SC = '?sharecode=TBMY3RYXH3';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  const hits = [];
  page.on('request', r => {
    const u = r.url();
    if (/microApp/i.test(u) && r.method() === 'POST') {
      hits.push({ url: u.replace(BASE, ''), body: (r.postData() || '').slice(0, 300) });
    }
  });
  page.on('response', async r => {
    const u = r.url();
    if (/microApp\/network|microApp\/request|proxy/i.test(u)) {
      let t = '';
      try { t = (await r.text()).slice(0, 400); } catch (e) { t = '(no body)'; }
      hits.push({ resp: r.status(), url: u.replace(BASE, ''), body: t });
    }
  });

  await page.goto(BASE + '/login' + SC, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(1500);
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc');
  await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter');
  await sleep(4500);
  await page.goto(BASE + '/' + SC, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(9000);

  console.log('HITS', hits.length);
  for (const h of hits.slice(0, 14)) console.log(JSON.stringify(h));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
