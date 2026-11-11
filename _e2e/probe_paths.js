const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:3002';

const paths = ['/setting', '/setting/proAuth', '/admin', '/homeOld', '/userCenter', '/systemSetting', '/panel/setting'];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1200));
  const inputs = await page.$$('input');
  await inputs[0].click({ clickCount: 3 }); await inputs[0].type('admin@sun.cc');
  await inputs[1].click({ clickCount: 3 }); await inputs[1].type('12345678');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 3000));

  for (const p of paths) {
    await page.goto(BASE + p, { waitUntil: 'networkidle2', timeout: 30000 }).catch(e => console.log(p, 'nav fail'));
    await new Promise(r => setTimeout(r, 1500));
    const t = await page.evaluate(() => ({
      url: location.pathname + location.search,
      h: [...document.querySelectorAll('h1,h2,h3,.text-base,.font-bold')].map(e => e.innerText.trim()).filter(Boolean).slice(0, 12),
      txt: document.body.innerText.replace(/\s+/g, ' ').slice(0, 200),
    }));
    console.log('==', p, '->', t.url, '|', JSON.stringify(t.h), '|', t.txt);
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
