const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  await page.goto('https://subtitle-manager.app.workbuddy.host/login', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(3000);
  const b = await page.evaluate(() => {
    const p = [...document.querySelectorAll('div')].find(d => /rgb\(108, 63, 245\)/.test(getComputedStyle(d).backgroundColor));
    let root = p;
    while (root.parentElement && root.getBoundingClientRect().width < 400) root = root.parentElement;
    const r = root.getBoundingClientRect();
    return { box: [Math.round(r.width), Math.round(r.height)], html: root.outerHTML };
  });
  console.log('容器尺寸', b.box);
  console.log(b.html.replace(/></g, '>\n<').slice(0, 7000));
  // 测 skew 是否随鼠标变化
  const read = () => page.evaluate(() => [...document.querySelectorAll('div')].filter(d => /skew/.test(getComputedStyle(d).transform)).map(d => ({ bg: getComputedStyle(d).backgroundColor, t: getComputedStyle(d).transform, l: d.style.left, w: d.style.width, h: d.style.height })));
  await page.mouse.move(10, 10); await sleep(700);
  console.log('鼠标左上:', JSON.stringify(await read()));
  await page.mouse.move(1430, 890); await sleep(700);
  console.log('鼠标右下:', JSON.stringify(await read()));
  await browser.close();
})();
