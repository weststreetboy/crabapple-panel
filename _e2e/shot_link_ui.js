const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 780, height: 1500 },
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console:' + m.text().slice(0, 120)); });

  await p.goto('http://127.0.0.1:8792/', { waitUntil: 'networkidle2' });
  await p.type('#password', 'test123');
  await p.click('#loginBtn');
  await new Promise((r) => setTimeout(r, 1200));

  await p.click('button[data-view="link"]');
  await new Promise((r) => setTimeout(r, 400));

  // 建两条：一条 iframe（模拟用户当前那条），一条深度隐藏
  await p.type('#linkUrl', 'https://daye-nav.app.workbuddy.host/?sharecode=TBMY3RYXH3');
  await p.select('#linkPlan', '1d');
  await p.select('#linkMode', 'frame');
  await p.click('#linkCreate');
  await p.waitForSelector('#linkResult:not([hidden])', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 900));

  const shown = await p.evaluate(() => ({
    url: document.getElementById('linkResultUrl').textContent,
    user: document.getElementById('linkResultUser').textContent,
    pass: document.getElementById('linkResultPass').textContent,
    target: document.getElementById('linkResultTarget').textContent,
  }));
  console.log('结果区:', JSON.stringify(shown, null, 1));

  await p.screenshot({ path: path.join(__dirname, 'shot-link-result.png'), fullPage: false });

  await p.type('#linkUrl', 'https://example.com/some/long/path/doc?id=1234567890');
  await p.select('#linkPlan', '7d');
  await p.select('#linkMode', 'proxy');
  await p.click('#linkCreate');
  await new Promise((r) => setTimeout(r, 1200));

  const cards = await p.evaluate(() => {
    const list = document.querySelectorAll('#linkList .lic');
    return Array.from(list).map((c) => c.innerText.replace(/\n+/g, ' | ').slice(0, 260));
  });
  console.log('列表卡片:', JSON.stringify(cards, null, 1));

  const listEl = await p.$('#linkList');
  await listEl.screenshot({ path: path.join(__dirname, 'shot-link-list.png') });

  // 校验：列表里必须同时有账号与密码，且要能复制
  const chk = await p.evaluate(() => {
    const first = document.querySelector('#linkList .lic');
    const txt = first ? first.innerText : '';
    return { hasUser: txt.includes('用户名'), hasPass: txt.includes('密码'), hasTarget: txt.includes('真实网址') };
  });
  console.log('列表校验:', JSON.stringify(chk));
  console.log('ERRORS:', JSON.stringify(errs.slice(0, 5)));

  await b.close();
})();
