const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:3002';

async function run(label, { weak = false, autoplayBlocked = false } = {}) {
  const args = ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'];
  if (autoplayBlocked) args.push('--autoplay-policy=user-gesture-required');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args, defaultViewport: { width: 1440, height: 900 } });
  const page = await browser.newPage();
  if (weak) {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 });
    });
  }
  const logs = [];
  page.on('console', m => { if (/bg-video/.test(m.text())) logs.push(m.text()); });

  await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1200));
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc');
  await inputs[1].type('12345678');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 4000));

  const st = await page.evaluate(() => {
    const v = document.querySelector('video.wallpaper-video');
    if (!v) return { err: 'no video' };
    return {
      paused: v.paused, t: +v.currentTime.toFixed(2), static: !!v.__spStatic,
      opacity: v.style.opacity, poster: !!document.querySelector('.sp-bg-poster'),
      resolution: [v.videoWidth, v.videoHeight],
    };
  });
  console.log(label, JSON.stringify(st), logs.length ? '| ' + logs.join(' ; ') : '');
  await page.screenshot({ path: `shot-bg-${label}.png` });
  await browser.close();
}

(async () => {
  await run('normal');
  await run('weak', { weak: true });
  await run('autoplayblocked', { autoplayBlocked: true });
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
