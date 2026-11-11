/* 授权中心本地验证（dev.js 内存 KV，重启即清空）：
   1) 签发 4 档（7 天试用 / 半年 / 1 年 / 永久）到期正确
   2) 未使用的授权码后端拒绝注销
   3) 标记已使用后允许注销
   4) 旧记录（备注含"已激活"）懒迁移补 usedAt
   5) CSV 导出含「是否已使用」列
   6) 页面下拉 4 个档位、默认 1 年
*/
const BASE = process.env.BASE || 'http://127.0.0.1:8791';
const PWD = process.env.LC_ADMIN_PWD || 'Fiery.813';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function req(path, opt) {
  opt = opt || {};
  const headers = { 'Content-Type': 'application/json' };
  if (opt.token) headers.Authorization = 'Bearer ' + opt.token;
  const r = await fetch(BASE + path, {
    method: opt.method || 'GET',
    headers,
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  const ct = r.headers.get('content-type') || '';
  return ct.includes('application/json') ? r.json() : r.text();
}

(async () => {
  const R = {};
  let health = null;
  for (let i = 0; i < 30; i++) {
    try {
      const h = await req('/api/health');
      if (h && h.ok === true) { health = h; break; }
    } catch (e) { /* 服务还没起来 */ }
    await sleep(400);
  }
  if (!health) throw new Error('dev 服务未就绪');
  R.health = health;

  const login = await req('/api/login', { method: 'POST', body: { username: 'admin', password: PWD } });
  R.loginOk = !!login.ok;
  if (!login.ok) throw new Error('登录失败: ' + JSON.stringify(login));
  const token = login.data && login.data.token;
  if (!token) throw new Error('登录未返回 token: ' + JSON.stringify(login));
  const A = { token };

  const plans = [
    { label: '7 天试用', days: 7 },
    { label: '半年', days: 183 },
    { label: '1 年', days: 365 },
    { label: '永久', days: 0 },
  ];
  const issued = [];
  for (const p of plans) {
    const res = await req('/api/licenses', {
      method: 'POST', token, body: { name: '验证-' + p.label, days: p.days, note: '' }
    });
    issued.push({ label: p.label, days: p.days, ok: !!res.ok, exp: res.data && res.data.exp, code: res.data && res.data.code });
  }
  R.issued = issued;

  const now = Math.floor(Date.now() / 1000);
  R.expCheck = issued.map(x => ({
    label: x.label,
    expectedDays: x.days,
    actualDays: x.exp ? Math.round((x.exp - now) / 86400) : 0,
    pass: x.days === 0 ? x.exp === 0 : Math.abs((x.exp - now) / 86400 - x.days) < 0.01,
  }));

  // 未使用 -> 注销应被后端拒绝
  const all1 = (await req('/api/licenses', A)).data;
  const item = all1.find(x => x.name === '验证-7 天试用');
  R.revokeBeforeUsed = await req('/api/licenses/revoke', { method: 'POST', token, body: { id: item.id } });

  // 标记已使用 -> 注销成功
  R.markUsed = await req('/api/licenses/markUsed', { method: 'POST', token, body: { id: item.id, used: true } });
  R.revokeAfterUsed = await req('/api/licenses/revoke', { method: 'POST', token, body: { id: item.id } });

  // 取消标记 -> 再注销应被拒绝（并且已注销记录不允许改使用状态）
  const unused = all1.find(x => x.name === '验证-半年');
  R.unmarkUsed = await req('/api/licenses/markUsed', { method: 'POST', token, body: { id: unused.id, used: false } });
  R.revokeAfterUnmark = await req('/api/licenses/revoke', { method: 'POST', token, body: { id: unused.id } });

  // 懒迁移：名称/备注含「已激活 / 在用」的老记录自动补 usedAt
  await req('/api/licenses', { method: 'POST', token, body: { name: '历史-本机在用', days: 0, note: '永久码，面板已激活' } });
  const all2 = (await req('/api/licenses', A)).data;
  const mig = all2.find(x => x.name === '历史-本机在用');
  const fresh = all2.find(x => x.name === '验证-1 年');
  R.migration = {
    oldUsedAt: mig.usedAt || 0, oldPass: !!mig.usedAt,
    newUsedAt: fresh.usedAt || 0, newPass: !fresh.usedAt,
  };

  // CSV 表头
  const csv = String(await req('/api/export?format=csv', A));
  R.csvHead = csv.split('\n')[0].replace(/^\ufeff/, '');
  R.csvHasUsedCol = R.csvHead.includes('是否已使用');

  // 页面下拉
  const html = String(await req('/'));
  R.selectOptions = [...html.matchAll(/<option value="(\d+)"([^>]*)>([^<]+)<\/option>/g)]
    .map(m => ({ value: Number(m[1]), label: m[3].trim(), selected: /selected/.test(m[2]) }));

  console.log(JSON.stringify(R, null, 1));
})();
