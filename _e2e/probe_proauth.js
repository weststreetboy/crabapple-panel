const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:3002';

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
  await inputs[0].type('admin@sun.cc');
  await inputs[1].type('12345678');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 3000));

  // 打开启动器（右上角第二个 float-btn）
  await page.mouse.click(1397, 43);
  await new Promise(r => setTimeout(r, 1500));

  // 点“授权管理”
  const clicked = await page.evaluate(() => {
    const els = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && (e.innerText || '').trim() === '授权管理');
    if (!els.length) return false;
    els[0].click();
    return true;
  });
  console.log('clicked 授权管理:', clicked);
  await new Promise(r => setTimeout(r, 2500));

  const info = await page.evaluate(() => ({
    url: location.href,
    txt: document.body.innerText.replace(/\s+/g, ' ').slice(0, 800),
  }));
  console.log('URL:', info.url);
  console.log('TXT:', info.txt);
  await page.screenshot({ path: 'shot-proauth.png', fullPage: false });

  // 结构：打印主内容区 DOM 树（最多 3 层）
  const tree = await page.evaluate(() => {
    function walk(el, d) {
      if (d > 4) return '';
      let s = '';
      for (const c of el.children) {
        const cls = (c.className && c.className.toString ? c.className.toString() : '').slice(0, 70);
        const t = (c.innerText || '').replace(/\s+/g, ' ').slice(0, 60);
        s += '  '.repeat(d) + `<${c.tagName.toLowerCase()} class="${cls}"> ${t}\n` + walk(c, d + 1);
      }
      return s;
    }
    const root = document.querySelector('#app > div > main') || document.querySelector('#app main') || document.body;
    return walk(root, 0).slice(0, 6000);
  });
  console.log('--- DOM ---');
  console.log(tree);
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
