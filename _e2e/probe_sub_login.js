const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'https://subtitle-manager.app.workbuddy.host/login';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 }).catch(e => console.log('goto', e.message));
  await sleep(3500);
  await page.screenshot({ path: 'sub-login.png' });
  const info = await page.evaluate(() => {
    const t = document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 800);
    const imgs = [...document.querySelectorAll('img')].map(i => ({ src: i.src.slice(0, 120), w: i.width, h: i.height, cls: i.className }));
    const svgs = [...document.querySelectorAll('svg')].length;
    const inputs = [...document.querySelectorAll('input')].map(i => ({ ph: i.placeholder, type: i.type, cls: i.className.slice(0, 80) }));
    const btns = [...document.querySelectorAll('button')].map(b => ({ t: (b.innerText || '').trim().slice(0, 20), cls: b.className.slice(0, 90) }));
    return { text: t, imgs, svgs, inputs, btns, size: [innerWidth, innerHeight] };
  });
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
})();
