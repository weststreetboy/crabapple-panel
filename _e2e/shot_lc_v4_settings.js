/* 补一张「设置页 + 已上传头像」的效果图 */
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8791';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1440, height: 950 }
  });
  const p = await b.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(700);
  await p.type('#username', 'admin');
  await p.type('#password', 'Fiery.813');
  await p.click('#loginBtn');
  await sleep(2000);
  await p.click('#whoEntry');
  await sleep(400);
  await p.evaluate(() => {
    const cv = document.createElement('canvas');
    cv.width = 200; cv.height = 160;
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 200, 160);
    g.addColorStop(0, '#6C3FF5'); g.addColorStop(1, '#FF9B6B');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 200, 160);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 74px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('D', 100, 82);
    const dataUrl = cv.toDataURL('image/png');
    const bin = atob(dataUrl.split(',')[1]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'avatar.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const inp = document.getElementById('avatarFile');
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(1600);
  await p.screenshot({ path: 'lc-v4-settings.png', fullPage: true });
  console.log('saved lc-v4-settings.png');
  await b.close();
})();
