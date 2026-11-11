const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:3002';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1700, height: 1000 },
  });
  const page = await browser.newPage();

  await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 120000 });
  await sleep(1500);
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc');
  await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter');
  await sleep(6000);

  await page.mouse.click(1640, 43);
  await sleep(1500);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && (e.innerText || '').trim() === '系统应用');
    if (el) el.click();
  });
  await sleep(2500);

  const goTab = async (name) => {
    const ok = await page.evaluate((n) => {
      const el = [...document.querySelectorAll('span.ml-2, span')].find(e => (e.innerText || '').trim() === n);
      if (el) { el.click(); return true; }
      return false;
    }, name);
    await sleep(2500);
    return ok;
  };
  console.log('切到迁移:', await goTab('迁移'));
  await sleep(1500);

  const info = await page.evaluate(() => {
    // 找标题为“系统应用 / 迁移”的弹窗
    const headers = [...document.querySelectorAll('*')].filter(e => (e.innerText||'').trim() === '系统应用 / 迁移' && e.children.length === 0);
    let modal = null;
    if (headers.length) {
      let n = headers[0];
      for (let i=0;i<10 && n && !modal;i++){ if(/modal|dialog/i.test((n.className||'').toString())) modal=n; n=n.parentElement; }
    }
    // 兜底：找含“备份”且含“恢复”的卡片
    if (!modal) {
      const cards = [...document.querySelectorAll('[class]')].filter(c => {
        const t = (c.innerText||'');
        return t.includes('备份') && t.includes('恢复') && t.length < 2000;
      });
      if (cards.length) modal = cards[cards.length-1];
    }
    if (!modal) return { found:false };
    // 打印弹窗主体结构
    function summarize(node, depth) {
      if (!node || depth > 6) return null;
      if (node.nodeType !== 1) return null;
      const cls = (node.className||'').toString().split(/\s+/).filter(Boolean).slice(0,3).join('.');
      const txt = (node.innerText||'').replace(/\s+/g,' ').trim().slice(0,40);
      const kids = [...node.children].map(c => summarize(c, depth+1)).filter(Boolean);
      if (kids.length === 0 && !txt) return null;
      return { tag: node.tagName.toLowerCase(), cls, txt: txt||undefined, kids };
    }
    const tree = summarize(modal, 0);
    return { found:true, modalClass: (modal.className||'').toString(), tree };
  });
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: path.join(__dirname, 'shot-dump-migrate2.png') });
  await browser.close();
})();
