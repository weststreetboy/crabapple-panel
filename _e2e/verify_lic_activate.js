const { login, openLauncher, clickText, launch } = require('./helper');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CODE = process.env.CODE || 'SPL-U6QX1W-87BD2-0C6CD';

(async () => {
  const { browser, page } = await launch();
  page.on('dialog', async d => { await d.accept(); });
  page.on('response', async r => {
    const u = r.url();
    if (/proAuth\/getStatus|localAuth|\/api\/login/.test(u)) {
      let t = ''; try { t = (await r.text()).slice(0, 200); } catch (e) {}
      console.log('NET', r.status(), u.replace('http://127.0.0.1:3002', ''), t);
    }
  });

  await login(page);
  await openLauncher(page);
  await clickText(page, '授权管理');
  await sleep(2500);

  const before = await page.evaluate(() => {
    const host = document.querySelector('.app-starter-modal-content .n-layout-content .fade-in-animation');
    const btn = document.getElementById('sp-lic-activate-btn');
    return {
      text: (host?.innerText || '').replace(/\s+/g, ' ').slice(0, 200),
      btn: btn ? { txt: btn.textContent, cls: btn.className } : null,
      hasCustomPanel: !!document.querySelector('.la-wrap'),
    };
  });
  console.log('BEFORE:', JSON.stringify(before, null, 1));
  await page.screenshot({ path: 'shot-lic-before.png' });

  // 点开「使用授权码激活」
  await page.evaluate(() => document.getElementById('sp-lic-activate-btn').click());
  await sleep(600);
  const dlg = await page.evaluate(() => {
    const d = document.getElementById('sp-lic-activate-dialog');
    return d ? { visible: true, text: d.innerText.replace(/\s+/g, ' ').slice(0, 160), hasInput: !!d.querySelector('#sp-lic-input') } : { visible: false };
  });
  console.log('DIALOG:', JSON.stringify(dlg));
  await page.screenshot({ path: 'shot-lic-dialog.png' });

  // 先试一个坏码，确认会报错
  await page.type('#sp-lic-input', 'SPL-U6QX1W-87BD2-0C6CE', { delay: 8 });
  await page.evaluate(() => document.getElementById('sp-lic-ok').click());
  await sleep(1200);
  console.log('坏码提示:', await page.evaluate(() => document.getElementById('sp-lic-msg')?.textContent));

  // 换成真码
  await page.evaluate(() => { document.getElementById('sp-lic-input').value = ''; });
  await page.type('#sp-lic-input', CODE, { delay: 8 });
  await page.evaluate(() => document.getElementById('sp-lic-ok').click());
  console.log('提交后提示:', await page.evaluate(() => document.getElementById('sp-lic-msg')?.textContent));

  // 等它自己 reload
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
  await sleep(4000);
  await page.mouse.click(1397, 43);
  await sleep(1300);
  await clickText(page, '授权管理');
  await sleep(2600);

  const after = await page.evaluate(() => {
    const host = document.querySelector('.app-starter-modal-content .n-layout-content .fade-in-animation');
    const btn = document.getElementById('sp-lic-activate-btn');
    return {
      text: (host?.innerText || '').replace(/\s+/g, ' ').slice(0, 240),
      btn: btn ? { txt: btn.textContent, cls: btn.className } : null,
      hasCustomPanel: !!document.querySelector('.la-wrap'),
    };
  });
  console.log('AFTER:', JSON.stringify(after, null, 1));
  await page.screenshot({ path: 'shot-lic-after.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
