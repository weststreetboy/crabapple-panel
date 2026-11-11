const { login, openLauncher, clickText, launch } = require('./helper');

(async () => {
  const { browser, page } = await launch();
  page.on('dialog', async d => { console.log('[dialog]', d.message()); await d.accept(); });
  await login(page);

  const vid = await page.evaluate(() => {
    const v = document.querySelector('video.wallpaper-video');
    if (!v) return 'no video';
    const cs = getComputedStyle(v);
    return {
      src: (v.currentSrc || v.src).slice(-60),
      paused: v.paused,
      readyState: v.readyState,
      muted: v.muted,
      loop: v.loop,
      playsinline: v.hasAttribute('playsinline'),
      webkitPlaysinline: v.hasAttribute('webkit-playsinline'),
      pipDisabled: v.disablePictureInPicture,
      transform: cs.transform,
      filter: v.style.filter,
      poster: !!document.querySelector('.sp-bg-poster'),
      duration: v.duration,
      videoSize: [v.videoWidth, v.videoHeight],
    };
  });
  console.log('VIDEO:', JSON.stringify(vid, null, 1));

  await new Promise(r=>setTimeout(r,1500));
  const vid2 = await page.evaluate(() => {
    const v = document.querySelector('video.wallpaper-video');
    return v ? { paused: v.paused, t: v.currentTime, poster: !!document.querySelector('.sp-bg-poster') } : null;
  });
  console.log('VIDEO after 1.5s:', JSON.stringify(vid2));

  await openLauncher(page);
  await clickText(page, '授权管理');
  await new Promise(r=>setTimeout(r,2200));

  const panel = await page.evaluate(() => {
    const el = document.querySelector('.la-wrap');
    if (!el) return 'panel not mounted';
    return {
      text: el.innerText.replace(/\s+/g, ' ').slice(0, 400),
      state: el.querySelector('#la-state')?.textContent,
      expire: el.querySelector('#la-expire')?.textContent,
      code: el.querySelector('#la-code')?.textContent,
      rect: (() => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(),
      hiddenKids: [...el.parentElement.children].filter(c => c.style.display === 'none').length,
    };
  });
  console.log('PANEL:', JSON.stringify(panel, null, 1));
  await page.screenshot({ path: 'shot-auth-center.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
