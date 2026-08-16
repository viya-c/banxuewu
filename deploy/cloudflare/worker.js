// 星光伴学屋 · Cloudflare Worker（替代 server.js）
// 仅处理 /api（静态资源由 GitHub Pages 托管）。状态存 D1，实时广播钩子预留给 M3。
import {
  APP_VERSION, BUILD_NO, HOUSEHOLD_ID, COLLECTIONS,
  ymd, endFromStart, uid,
  packageStats, migrateGrades, currentGrade,
  ensureSessions, projectEndDate, nextFreeSlot, rescheduleFuture,
  seedDemo, reconcile, defaultData
} from './logic.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Access-Code'
};

/* ---------------------------- D1 状态读写 ---------------------------- */
async function loadState(env) {
  const row = await env.DB.prepare('SELECT data, updated_at FROM households WHERE id = ?')
    .bind(HOUSEHOLD_ID).first();
  if (row && row.data) {
    const state = JSON.parse(row.data);
    return reconcile(state);
  }
  // 首次：用默认数据建库
  const fresh = defaultData();
  await saveState(env, fresh);
  return fresh;
}
async function saveState(env, state) {
  await env.DB.prepare('INSERT OR REPLACE INTO households (id, data, updated_at) VALUES (?, ?, ?)')
    .bind(HOUSEHOLD_ID, JSON.stringify(state), Date.now()).run();
}

/* M3 实时同步钩子：有 Durable Object 绑定时广播 updatedAt；未接入时为空操作 */
async function broadcast(env, householdId, updatedAt) {
  if (!env.REALTIME) return;
  try {
    const id = env.REALTIME.idFromName(householdId);
    const stub = env.REALTIME.get(id);
    await stub.fetch('https://realtime/notify', { method: 'POST', body: JSON.stringify({ updatedAt }) });
  } catch (e) { console.error('[broadcast]', e.message); }
}

/* ---------------------------- HTTP 工具 ---------------------------- */
function json(obj, code = 200) {
  return new Response(JSON.stringify(obj), {
    status: code,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS }
  });
}
async function safeBody(req) {
  try { const t = await req.text(); return t ? JSON.parse(t) : {}; } catch { return {}; }
}

/* ---------------------------- 路由 ---------------------------- */
async function handleAPI(request, env, state) {
  const url = new URL(request.url);
  const seg = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = request.method.toUpperCase();
  const query = Object.fromEntries(url.searchParams.entries());
  const commit = async () => { const t = Date.now(); state.__updatedAt = t; await saveState(env, state); await broadcast(env, HOUSEHOLD_ID, t); };

  // 无需鉴权
  if (seg[0] === 'meta') {
    return json({ ok: true, version: APP_VERSION, build: BUILD_NO, familyName: state.family.name, childName: state.family.childName, childAvatar: state.family.childAvatar, needCode: !!state.family.accessCode });
  }
  if (seg[0] === 'login' && method === 'POST') {
    const body = await safeBody(request);
    const ok = String(body.code || '').trim() === String(state.family.accessCode || '').trim();
    if (!ok) return json({ ok: false, error: '访问码不正确' }, 401);
    return json({ ok: true, token: state.family.accessCode });
  }

  // 鉴权
  const token = request.headers.get('x-access-code') || query.code || '';
  if (state.family.accessCode && String(token) !== String(state.family.accessCode)) {
    return json({ ok: false, error: '未授权，请输入家庭访问码' }, 401);
  }

  // 全量状态
  if (seg[0] === 'state' && method === 'GET') {
    const pkgs = state.packages.map(p => ({ ...p, stats: packageStats(p) }));
    return json({ ok: true, data: { ...state, packages: pkgs }, meta: { version: APP_VERSION, build: BUILD_NO, serverTime: new Date().toISOString() } });
  }

  // 家庭 / 设置
  if (seg[0] === 'family' && method === 'PUT') {
    const body = await safeBody(request);
    Object.assign(state.family, body); await commit();
    return json({ ok: true, data: state.family });
  }
  if (seg[0] === 'settings' && method === 'PUT') {
    const body = await safeBody(request);
    state.settings = { ...state.settings, ...body, reminders: { ...state.settings.reminders, ...(body.reminders || {}) } };
    await commit(); return json({ ok: true, data: state.settings });
  }

  // 切换当前年级
  if (seg[0] === 'grades' && seg[2] === 'activate' && method === 'POST') {
    state.grades.forEach(g => g.current = (g.id === seg[1]));
    await commit(); return json({ ok: true, data: state.grades });
  }

  // 课包消课记录
  if (seg[0] === 'packages' && seg[2] === 'records') {
    const pkg = state.packages.find(p => p.id === seg[1]);
    if (!pkg) return json({ ok: false, error: '课包不存在' }, 404);
    pkg.records = pkg.records || [];
    if (method === 'POST') {
      const body = await safeBody(request);
      const rec = { id: uid('r'), date: body.date || ymd(new Date()), type: body.type || 'consume', hours: Number(body.hours) || 1, note: body.note || '', createdAt: new Date().toISOString() };
      pkg.records.unshift(rec); await commit();
      return json({ ok: true, data: { ...pkg, stats: packageStats(pkg) } });
    }
    if (method === 'DELETE' && seg[3]) {
      pkg.records = pkg.records.filter(r => r.id !== seg[3]); await commit();
      return json({ ok: true, data: { ...pkg, stats: packageStats(pkg) } });
    }
  }

  // 自动生成 / 补充课次
  if (seg[0] === 'packages' && seg[2] === 'generate' && method === 'POST') {
    const pkg = state.packages.find(p => p.id === seg[1]);
    if (!pkg) return json({ ok: false, error: '课包不存在' }, 404);
    const n = ensureSessions(pkg); await commit();
    return json({ ok: true, data: { ...pkg, stats: packageStats(pkg) }, generated: n });
  }
  if (seg[0] === 'packages' && seg[2] === 'reschedule-future' && method === 'POST') {
    const pkg = state.packages.find(p => p.id === seg[1]);
    if (!pkg) return json({ ok: false, error: '课包不存在' }, 404);
    const moved = rescheduleFuture(pkg); await commit();
    return json({ ok: true, data: { ...pkg, stats: packageStats(pkg) }, moved });
  }
  if (seg[0] === 'packages' && seg[2] === 'autoend' && method === 'POST') {
    const pkg = state.packages.find(p => p.id === seg[1]);
    if (!pkg) return json({ ok: false, error: '课包不存在' }, 404);
    const end = projectEndDate(pkg);
    if (!end) return json({ ok: false, error: '请先设置总课时与每周上课时间' }, 400);
    pkg.endDate = end;
    const n = ensureSessions(pkg); await commit();
    return json({ ok: true, data: { ...pkg, stats: packageStats(pkg) }, endDate: end, generated: n });
  }
  if (seg[0] === 'packages' && seg[2] === 'sessions' && seg[4] === 'action' && method === 'POST') {
    const pkg = state.packages.find(p => p.id === seg[1]);
    if (!pkg) return json({ ok: false, error: '课包不存在' }, 404);
    pkg.sessions = pkg.sessions || [];
    const s = pkg.sessions.find(x => x.id === seg[3]);
    if (!s) return json({ ok: false, error: '课次不存在' }, 404);
    const body = await safeBody(request);
    const act = body.action;
    if (act === 'attend') { s.status = 'at'; if (body.note !== undefined) s.note = body.note; }
    else if (act === 'leave') { s.status = 'lv'; if (body.note !== undefined) s.note = body.note; }
    else if (act === 'cancel') { s.status = 'no'; }
    else if (act === 'undo') { s.status = 'sc'; s.rescheduled = false; if (s.origDate) { s.plannedDate = s.origDate; s.weekday = new Date(s.origDate + 'T00:00:00').getDay(); } s.origDate = null; }
    else if (act === 'reschedule') {
      if (!body.date) return json({ ok: false, error: '请选择调课后的日期' }, 400);
      if (!s.origDate) s.origDate = s.plannedDate;
      s.plannedDate = body.date; s.weekday = new Date(body.date + 'T00:00:00').getDay(); s.rescheduled = true;
      if (body.start) s.start = body.start; if (body.end) s.end = body.end;
    }
    else if (act === 'makeup' || act === 'postpone') {
      let date = body.date;
      if (act === 'postpone' || !date) date = nextFreeSlot(pkg, s);
      const wd = new Date(date + 'T00:00:00').getDay();
      const slot = (pkg.schedule || []).find(x => Number(x.weekday) === wd) || { start: s.start, end: s.end };
      pkg.sessions.push({
        id: uid('s'), idx: pkg.sessions.length, plannedDate: date, weekday: wd,
        start: body.start || slot.start, end: body.end || slot.end,
        status: 'mk', rescheduled: false, makeupOf: s.id,
        hours: Number(s.hours) || Number(pkg.hoursEach) || 1,
        note: body.note || (act === 'postpone' ? '顺延补课' : '补课'), createdAt: new Date().toISOString()
      });
      s.status = 'lv'; s.note = (s.note ? s.note + '；' : '') + '已安排补课';
    }
    else return json({ ok: false, error: '未知动作' }, 400);
    s.updatedAt = new Date().toISOString(); await commit();
    return json({ ok: true, data: { ...pkg, stats: packageStats(pkg) } });
  }
  if (seg[0] === 'packages' && seg[2] === 'sessions') {
    const pkg = state.packages.find(p => p.id === seg[1]);
    if (!pkg) return json({ ok: false, error: '课包不存在' }, 404);
    pkg.sessions = pkg.sessions || [];
    if (seg[3]) {
      const s = pkg.sessions.find(x => x.id === seg[3]);
      if (!s) return json({ ok: false, error: '课次不存在' }, 404);
      if (method === 'PUT') {
        const body = await safeBody(request);
        if (body.status) s.status = body.status;
        if (body.note !== undefined) s.note = body.note;
        if (body.plannedDate) { s.plannedDate = body.plannedDate; s.weekday = new Date(body.plannedDate + 'T00:00:00').getDay(); }
        if (body.start) s.start = body.start; if (body.end) s.end = body.end;
        if (body.hours != null) s.hours = Number(body.hours) || 1;
        s.updatedAt = new Date().toISOString(); await commit();
        return json({ ok: true, data: { ...pkg, stats: packageStats(pkg) } });
      }
      if (method === 'DELETE') {
        pkg.sessions = pkg.sessions.filter(x => x.id !== seg[3]); await commit();
        return json({ ok: true, data: { ...pkg, stats: packageStats(pkg) } });
      }
    }
    if (method === 'POST') {
      const body = await safeBody(request);
      const sess = {
        id: uid('s'), idx: pkg.sessions.length,
        plannedDate: body.plannedDate || ymd(new Date()),
        weekday: body.weekday != null ? Number(body.weekday) : new Date((body.plannedDate || ymd(new Date())) + 'T00:00:00').getDay(),
        start: body.start || (pkg.schedule[0] && pkg.schedule[0].start) || '',
        end: body.end || (pkg.schedule[0] && pkg.schedule[0].end) || '',
        status: body.status || 'sc', rescheduled: !!body.rescheduled, makeupOf: body.makeupOf || null,
        hours: body.hours != null ? Number(body.hours) : (Number(pkg.hoursEach) || 1),
        note: body.note || '', createdAt: new Date().toISOString()
      };
      pkg.sessions.push(sess); await commit();
      return json({ ok: true, data: { ...pkg, stats: packageStats(pkg) } });
    }
  }



  // 每日评价
  if (seg[0] === 'daily-ratings' && method === 'POST') {
    const body = await safeBody(request);
    const gradeId = body.gradeId || (state.grades && (state.grades.find(g => g.current) || state.grades[0] || {}).id) || '';
    const date = body.date || ymd(new Date());
    if (!date) return json({ ok: false, error: '缺少日期' }, 400);
    state.dailyRatings = state.dailyRatings || [];
    let r = state.dailyRatings.find(x => x.gradeId === gradeId && x.date === date);
    if (!r) { r = { id: uid('dr'), gradeId, date, createdAt: new Date().toISOString() }; state.dailyRatings.push(r); }
    r.att = body.att != null ? Number(body.att) : (r.att || 0);
    r.meth = body.meth != null ? Number(body.meth) : (r.meth || 0);
    r.eff = body.eff != null ? Number(body.eff) : (r.eff || 0);
    r.by = body.by || r.by || '';
    r.updatedAt = new Date().toISOString();
    await commit(); return json({ ok: true, data: r });
  }

  // 通用集合 CRUD（必须在上述特例之后）
  const col = seg[0];
  if (COLLECTIONS.includes(col)) {
    const list = state[col];
    if (method === 'GET') return json({ ok: true, data: list });
    if (method === 'POST') {
      const body = await safeBody(request);
      const item = { id: uid(col[0]), createdAt: new Date().toISOString(), ...body };
      if (col === 'packages') item.records = item.records || [];
      if (col === 'grades') { if (item.current) state.grades.forEach(g => g.current = false); item.archived = !!item.archived; }
      list.push(item); await commit();
      return json({ ok: true, data: col === 'packages' ? { ...item, stats: packageStats(item) } : item });
    }
    if (method === 'PUT' && seg[1]) {
      const body = await safeBody(request);
      const i = list.findIndex(x => x.id === seg[1]);
      if (i < 0) return json({ ok: false, error: '记录不存在' }, 404);
      list[i] = { ...list[i], ...body, id: list[i].id, updatedAt: new Date().toISOString() };
      if (col === 'grades' && body.current) state.grades.forEach(g => { if (g.id !== seg[1]) g.current = false; });
      await commit();
      return json({ ok: true, data: col === 'packages' ? { ...list[i], stats: packageStats(list[i]) } : list[i] });
    }
    if (method === 'DELETE' && seg[1]) {
      const i = list.findIndex(x => x.id === seg[1]);
      if (i < 0) return json({ ok: false, error: '记录不存在' }, 404);
      const [removed] = list.splice(i, 1);
      if (col === 'grades') {
        state.courses = state.courses.filter(c => c.gradeId !== removed.id);
        state.packages = state.packages.filter(p => p.gradeId !== removed.id);
        state.homeworks = state.homeworks.filter(h => h.gradeId !== removed.id);
        state.exams = state.exams.filter(e => e.gradeId !== removed.id);
        if (removed.current && state.grades[0]) state.grades[0].current = true;
      }
      if (col === 'grades' || col === 'homeworks') {
        state.checkins = state.checkins.filter(c => state.homeworks.some(h => h.id === c.homeworkId));
      }
      if (col === 'courses') state.homeworks.forEach(h => { if (h.courseId === removed.id) h.courseId = null; });
      await commit(); return json({ ok: true, data: removed });
    }
  }

  // 作业打卡
  if (seg[0] === 'checkin' && method === 'POST' && seg[1]) {
    const body = await safeBody(request);
    const hw = state.homeworks.find(h => h.id === seg[1]);
    if (!hw) return json({ ok: false, error: '作业不存在' }, 404);
    if (body.cancel) {
      hw.status = 'todo'; hw.checkinAt = null; hw.checkinNote = ''; hw.checkinBy = ''; hw.images = [];
      hw.att = null; hw.meth = null; hw.eff = null; hw.qual = null; hw.quality = null;
      state.checkins = state.checkins.filter(c => c.homeworkId !== hw.id);
    } else {
      hw.status = 'done'; hw.checkinAt = new Date().toISOString(); hw.checkinNote = body.note || '';
      hw.checkinBy = body.by || ''; hw.duration = body.duration || null;
      hw.qual = body.qual != null ? Number(body.qual) : (hw.qual || null);
      hw.att = null; hw.meth = null; hw.eff = null; hw.quality = null;
      if (Array.isArray(body.images)) hw.images = body.images;
      const stars = Number(hw.qual) || 0;
      state.checkins = state.checkins.filter(c => c.homeworkId !== hw.id);
      state.checkins.push({ id: uid('c'), homeworkId: hw.id, subject: hw.subject, date: hw.checkinAt, by: hw.checkinBy, stars, qual: hw.qual });
    }
    await commit(); return json({ ok: true, data: hw });
  }

  // 图片上传（base64）。有 R2 绑定则存 R2，否则直接回传 dataURL（前端可直接当 src）
  if (seg[0] === 'upload' && method === 'POST') {
    const body = await safeBody(request);
    const m = /^data:(image\/(png|jpe?g|webp|gif));base64,(.+)$/i.exec(body.dataUrl || '');
    if (!m) return json({ ok: false, error: '图片格式不支持' }, 400);
    if (env.BUCKET) {
      const ext = m[2].toLowerCase() === 'jpeg' ? 'jpg' : m[2].toLowerCase();
      const name = uid('img') + '.' + ext;
      await env.BUCKET.put(name, m[3], { httpMetadata: { contentType: m[1] } });
      return json({ ok: true, url: '/uploads/' + name });
    }
    return json({ ok: true, url: body.dataUrl });
  }

  // 一键示例数据
  if (seg[0] === 'demo' && method === 'POST') {
    const g = currentGrade(state);
    if (!g) return json({ ok: false, error: '请先创建年级' }, 400);
    seedDemo(state, g.id); migrateGrades(state); await commit();
    return json({ ok: true });
  }
  // 清空当前年级
  if (seg[0] === 'clear' && method === 'POST') {
    const g = currentGrade(state);
    if (!g) return json({ ok: false, error: '没有可清空的年级' }, 400);
    state.courses = state.courses.filter(c => c.gradeId !== g.id);
    state.packages = state.packages.filter(p => p.gradeId !== g.id);
    state.homeworks = state.homeworks.filter(h => h.gradeId !== g.id);
    state.exams = state.exams.filter(e => e.gradeId !== g.id);
    await commit(); return json({ ok: true });
  }
  // 导出 / 导入
  if (seg[0] === 'export' && method === 'GET') return json({ ok: true, data: state });
  if (seg[0] === 'import' && method === 'POST') {
    const body = await safeBody(request);
    if (!body || !Array.isArray(body.grades)) return json({ ok: false, error: '备份文件格式不正确' }, 400);
    state = body; state.version = APP_VERSION; reconcile(state); await commit();
    return json({ ok: true });
  }

  return json({ ok: false, error: '接口不存在：' + url.pathname }, 404);
}

/* ---------------------------- 入口 ---------------------------- */
export { Realtime } from './realtime.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    // WebSocket 实时通道：把升级请求转发给该家庭的 Durable Object
    if (url.pathname === '/api/ws' && request.headers.get('upgrade') === 'websocket') {
      if (!env.REALTIME) return json({ ok: false, error: '未配置 REALTIME（实时同步）绑定' }, 500);
      const id = env.REALTIME.idFromName(HOUSEHOLD_ID);
      return env.REALTIME.get(id).fetch(request);
    }
    if (url.pathname.startsWith('/api/')) {
      try {
        const state = await loadState(env);
        return await handleAPI(request, env, state);
      } catch (e) {
        console.error('[服务异常]', e);
        return json({ ok: false, error: e.message }, 500);
      }
    }
    return json({ ok: false, error: 'Worker 仅处理 /api，静态资源请由 GitHub Pages 提供' }, 404);
  }
};
