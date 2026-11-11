const { login, openLauncher, clickText, launch } = require('./helper');

(async () => {
  const { browser, page } = await launch();
  page.on('dialog', async d => { console.log('[dialog]', d.message()); await d.accept(); });
  page.on('console', m => { const t = m.text(); if (/ERR|error|CORS|fail/i.test(t)) console.log('[console]', t.slice(0, 160)); });
  page.on('requestfailed', r => {
    const u = r.url();
    if (u.includes('auth.xuers.dpdns.org') || u.includes('localAuth')) console.log('[reqfail]', u.slice(0, 90), r.failure()?.errorText);
  });
  page.on('response', async r => {
    const u = r.url();
    if (u.includes('/api/verify') || u.includes('/localAuth/status')) {
      let t = ''; try { t = (await r.text()).slice(0, 160); } catch (e) {}
      console.log('NET', r.status(), u.replace('https://auth.xuers.dpdns.org', 'CLOUD'), t);
    }
  });

  await login(page);
  await openLauncher(page);
  await clickText(page, '授权管理');
  await new Promise(r => setTimeout(r, 2500));

  const waitCloud = async () => {
    for (let i = 0; i < 20; i++) {
      const t = await page.evaluate(() => (document.querySelector('#la-cloud-txt') || {}).textContent || '');
      if (t && !/检测中/.test(t)) return t;
      await new Promise(r => setTimeout(r, 400));
    }
    return 'timeout';
  };

  const cloud = await waitCloud();
  const info = await page.evaluate(() => {
    const el = document.querySelector('.la-wrap');
    if (!el) return { mounted: false };
    const link = el.querySelector('#la-cloud-link');
    const jump = el.querySelector('#la-cloud a');
    return {
      mounted: true,
      state: el.querySelector('#la-state')?.textContent,
      code: el.querySelector('#la-code')?.textContent,
      cloud: el.querySelector('#la-cloud-txt')?.textContent,
      cloudClass: el.querySelector('#la-cloud')?.className,
      linkHref: link?.getAttribute('href'),
      linkText: link?.textContent,
      jumpText: jump?.textContent,
      linksOpenBlank: !!link?.getAttribute('target'),
      overflow: (() => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), scrollH: el.scrollHeight, scrollW: el.scrollWidth };
      })(),
    };
  });
  console.log('CLOUD:', cloud);
  console.log('PANEL:', JSON.stringify(info, null, 1));
  await page.screenshot({ path: 'shot-auth-cloud.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
