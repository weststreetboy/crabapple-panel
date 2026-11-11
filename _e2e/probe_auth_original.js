const { login, openLauncher, clickText, launch } = require('./helper');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const { browser, page } = await launch();
  // 让自定义授权面板提前退出，露出 Sun-Panel 原始授权页
  await page.evaluateOnNewDocument(() => { window.__spAuthCenterReady = true; });
  page.on('dialog', async d => { console.log('[dialog]', d.message()); await d.accept(); });
  const net = [];
  page.on('request', r => {
    const u = r.url();
    if (/proAuth|license|activation|active/i.test(u) && r.method() !== 'OPTIONS') {
      net.push({ m: r.method(), u: u.replace('http://127.0.0.1:3002', ''), body: (r.postData() || '').slice(0, 300) });
    }
  });
  page.on('response', async r => {
    const u = r.url();
    if (/proAuth|license|activation|active/i.test(u)) {
      let t = ''; try { t = (await r.text()).slice(0, 240); } catch (e) {}
      console.log('RESP', r.status(), u.replace('http://127.0.0.1:3002', ''), t);
    }
  });

  await login(page);
  await openLauncher(page);
  await clickText(page, '授权管理');
  await sleep(2500);

  const dom = await page.evaluate(() => {
    const host = document.querySelector('.app-starter-modal-content .n-layout-content .fade-in-animation');
    if (!host) return { host: false };
    return {
      host: true,
      text: (host.innerText || '').replace(/\s+/g, ' ').slice(0, 900),
      inputs: [...host.querySelectorAll('input')].map(i => ({ ph: i.placeholder, type: i.type, name: i.name, cls: i.className.slice(0, 60) })),
      buttons: [...host.querySelectorAll('button,.n-button')].map(b => (b.innerText || '').trim()).filter(Boolean).slice(0, 20),
      tabs: [...host.querySelectorAll('.n-tabs-tab')].map(t => (t.innerText || '').trim()),
    };
  });
  console.log('DOM:', JSON.stringify(dom, null, 1));
  console.log('REQS:', JSON.stringify(net, null, 1));
  await page.screenshot({ path: 'shot-auth-original.png' });

  // 在原始页面里试填一个授权码并点激活，抓真实请求体
  const filled = await page.evaluate(() => {
    const host = document.querySelector('.app-starter-modal-content .n-layout-content .fade-in-animation');
    const inp = [...host.querySelectorAll('input')].find(i => /授权|激活|license/i.test(i.placeholder || '') || (i.closest('.n-tabs') ? false : true));
    if (!inp) return 'no input';
    inp.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(inp, 'SPL-0-2c75c-4c6e2');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return 'filled: ' + (inp.placeholder || '(no placeholder)');
  });
  console.log('FILL:', filled);
  await page.evaluate(() => {
    const host = document.querySelector('.app-starter-modal-content .n-layout-content .fade-in-animation');
    const btns = [...host.querySelectorAll('button,.n-button')];
    const b = btns.find(x => /激活|验证|授权/.test(x.innerText || ''));
    if (b) b.click();
  });
  await sleep(3000);
  console.log('REQS after click:', JSON.stringify(net, null, 1));
  await page.screenshot({ path: 'shot-auth-original2.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
