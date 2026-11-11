const { login, openLauncher, clickText, launch } = require('./helper');

(async () => {
  const { browser, page } = await launch();
  await login(page);
  await openLauncher(page);

  await clickText(page, '授权管理');
  await new Promise(r => setTimeout(r, 2200));
  let a = await page.evaluate(() => {
    const p = document.querySelector('.la-wrap');
    return p ? { mounted: true, state: p.querySelector('#la-state').textContent, code: p.querySelector('#la-code').textContent } : { mounted: false };
  });
  console.log('1) 打开授权管理:', JSON.stringify(a));

  await clickText(page, '关于');
  await new Promise(r => setTimeout(r, 1500));
  let b = await page.evaluate(() => {
    const p = document.querySelector('.la-wrap');
    const host = document.querySelector('.app-starter-modal-content .n-layout-content .fade-in-animation');
    return { panelGone: !p, hostText: (host ? host.innerText : '').replace(/\s+/g, ' ').slice(0, 120), hiddenLeft: host ? [...host.children].filter(c => c.style.display === 'none').length : -1 };
  });
  console.log('2) 切到关于页:', JSON.stringify(b));

  await clickText(page, '授权管理');
  await new Promise(r => setTimeout(r, 2000));
  let c = await page.evaluate(() => {
    const p = document.querySelector('.la-wrap');
    return p ? { mounted: true, state: p.querySelector('#la-state').textContent } : { mounted: false };
  });
  console.log('3) 切回授权管理:', JSON.stringify(c));

  // 换到不含弹窗的页面，确认脚本不报错
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 1200));
  const v = await page.evaluate(() => {
    const el = document.querySelector('video.wallpaper-video');
    return el ? { paused: el.paused, t: +el.currentTime.toFixed(1), err: !!el.error } : null;
  });
  console.log('4) 关闭弹窗后视频:', JSON.stringify(v));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
