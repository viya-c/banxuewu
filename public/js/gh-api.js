/* 星光伴学屋 · GitHub 后端适配层（仓库当数据库）
 * 仅在 config.js 配置 window.__GITHUB 时启用。
 * 整份应用状态存为仓库内一个 JSON 文件，前端用 GitHub API 读写，
 * 家人多端通过轮询（每 15 秒）实现同步。所有 api() 逻辑与 Worker 版一致。
 */
(function () {
  if (!window.__GITHUB) return;
  const G = window.__GITHUB;
  let ghSha = null;       // 当前 state.json 的 blob sha
  let syncing = false;

  function headers(extra) {
    const h = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (G.token) h.Authorization = 'Bearer ' + G.token;
    return Object.assign(h, extra || {});
  }
  function fileUrl() {
    return `https://api.github.com/repos/${encodeURIComponent(G.owner)}/${encodeURIComponent(G.repo)}/contents/${encodeURIComponent(G.dataPath)}?ref=${encodeURIComponent(G.branch)}`;
  }
  function b64enc(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64dec(b64) { return decodeURIComponent(escape(atob(b64))); }

  async function ghGet() {
    const res = await fetch(fileUrl(), { headers: headers() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('读取仓库失败（HTTP ' + res.status + '）');
    const j = await res.json();
    ghSha = j.sha;
    return JSON.parse(b64dec(j.content));
  }
  async function ghPut(state) {
    const body = { message: '星光伴学屋 · 更新数据', content: b64enc(JSON.stringify(state)), branch: G.branch };
    if (ghSha) body.sha = ghSha;     // 已存在则带 sha；首次创建不带
    const res = await fetch(fileUrl(), {
      method: 'PUT',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body)
    });
    if (res.status === 409) { ghSha = null; await ghGet(); throw new Error('数据冲突，已自动刷新，请重试'); }
    if (!res.ok) throw new Error('写入仓库失败（HTTP ' + res.status + '）');
    const j = await res.json();
    ghSha = j.content.sha;
  }

  /* 端口：语义与 worker.js handleAPI 一致，但操作本地 state 并持久化到 GitHub */
  async function ghApi(path, opt = {}) {
    if (!S.data) {
      let st = await ghGet();
      if (!st || typeof st !== 'object') st = defaultData();
      S.data = reconcile(st);
    }
    const state = S.data;
    const seg = path.replace(/^\//, '').split('/').filter(Boolean);
    const method = (opt.method || 'GET').toUpperCase();
    const body = opt.body || {};
    const commit = async () => { await ghPut(S.data); };
    const ok = (data) => ({ ok: true, data });

    if (seg[0] === 'meta') return { ok: true, version: APP_VERSION, build: BUILD_NO, familyName: state.family.name, childName: state.family.childName, childAvatar: state.family.childAvatar, needCode: !!state.family.accessCode };
    if (seg[0] === 'login' && method === 'POST') {
      const good = String(body.code || '').trim() === String(state.family.accessCode || '').trim();
      if (!good) return { ok: false, error: '访问码不正确' };
      return { ok: true, token: state.family.accessCode };
    }
    if (seg[0] === 'state' && method === 'GET') {
      const pkgs = state.packages.map(p => ({ ...p, stats: packageStats(p) }));
      return { ok: true, data: { ...state, packages: pkgs }, meta: { version: APP_VERSION, build: BUILD_NO, serverTime: new Date().toISOString() } };
    }
    if (seg[0] === 'family' && method === 'PUT') { Object.assign(state.family, body); await commit(); return ok(state.family); }
    if (seg[0] === 'settings' && method === 'PUT') { state.settings = { ...state.settings, ...body, reminders: { ...state.settings.reminders, ...(body.reminders || {}) } }; await commit(); return ok(state.settings); }
    if (seg[0] === 'grades' && seg[2] === 'activate' && method === 'POST') { state.grades.forEach(g => g.current = (g.id === seg[1])); await commit(); return ok(state.grades); }

    // 课包子路由
    if (seg[0] === 'packages' && seg[2] === 'records') {
      const pkg = state.packages.find(p => p.id === seg[1]); if (!pkg) return { ok: false, error: '课包不存在' };
      pkg.records = pkg.records || [];
      if (method === 'POST') { pkg.records.unshift({ id: uid('r'), date: body.date || ymd(new Date()), type: body.type || 'consume', hours: Number(body.hours) || 1, note: body.note || '', createdAt: new Date().toISOString() }); await commit(); return ok({ ...pkg, stats: packageStats(pkg) }); }
      if (method === 'DELETE' && seg[3]) { pkg.records = pkg.records.filter(r => r.id !== seg[3]); await commit(); return ok({ ...pkg, stats: packageStats(pkg) }); }
    }
    if (seg[0] === 'packages' && seg[2] === 'generate' && method === 'POST') { const pkg = state.packages.find(p => p.id === seg[1]); if (!pkg) return { ok: false, error: '课包不存在' }; const n = ensureSessions(pkg); await commit(); return ok({ ...pkg, stats: packageStats(pkg), generated: n }); }
    if (seg[0] === 'packages' && seg[2] === 'reschedule-future' && method === 'POST') { const pkg = state.packages.find(p => p.id === seg[1]); if (!pkg) return { ok: false, error: '课包不存在' }; const moved = rescheduleFuture(pkg); await commit(); return ok({ ...pkg, stats: packageStats(pkg), moved }); }
    if (seg[0] === 'packages' && seg[2] === 'autoend' && method === 'POST') { const pkg = state.packages.find(p => p.id === seg[1]); if (!pkg) return { ok: false, error: '课包不存在' }; const end = projectEndDate(pkg); if (!end) return { ok: false, error: '请先设置总课时与每周上课时间' }; pkg.endDate = end; const n = ensureSessions(pkg); await commit(); return ok({ ...pkg, stats: packageStats(pkg), endDate: end, generated: n }); }
    if (seg[0] === 'packages' && seg[2] === 'sessions' && seg[4] === 'action' && method === 'POST') {
      const pkg = state.packages.find(p => p.id === seg[1]); if (!pkg) return { ok: false, error: '课包不存在' };
      const s = pkg.sessions.find(x => x.id === seg[3]); if (!s) return { ok: false, error: '课次不存在' };
      const act = body.action;
      if (act === 'attend') { s.status = 'at'; if (body.note !== undefined) s.note = body.note; }
      else if (act === 'leave') { s.status = 'lv'; if (body.note !== undefined) s.note = body.note; }
      else if (act === 'cancel') { s.status = 'no'; }
      else if (act === 'undo') { s.status = 'sc'; s.rescheduled = false; if (s.origDate) { s.plannedDate = s.origDate; s.weekday = new Date(s.origDate + 'T00:00:00').getDay(); } s.origDate = null; }
      else if (act === 'reschedule') {
        if (!body.date) return { ok: false, error: '请选择调课后的日期' };
        if (!s.origDate) s.origDate = s.plannedDate;
        s.plannedDate = body.date; s.weekday = new Date(body.date + 'T00:00:00').getDay(); s.rescheduled = true;
        if (body.start) s.start = body.start; if (body.end) s.end = body.end;
      }
      else if (act === 'makeup' || act === 'postpone') {
        let date = body.date; if (act === 'postpone' || !date) date = nextFreeSlot(pkg, s);
        const wd = new Date(date + 'T00:00:00').getDay();
        const slot = (pkg.schedule || []).find(x => Number(x.weekday) === wd) || { start: s.start, end: s.end };
        pkg.sessions.push({ id: uid('s'), idx: pkg.sessions.length, plannedDate: date, weekday: wd, start: body.start || slot.start, end: body.end || slot.end, status: 'mk', rescheduled: false, makeupOf: s.id, hours: Number(s.hours) || Number(pkg.hoursEach) || 1, note: body.note || (act === 'postpone' ? '顺延补课' : '补课'), createdAt: new Date().toISOString() });
        s.status = 'lv'; s.note = (s.note ? s.note + '；' : '') + '已安排补课';
      }
      else return { ok: false, error: '未知动作' };
      s.updatedAt = new Date().toISOString(); await commit(); return ok({ ...pkg, stats: packageStats(pkg) });
    }
    if (seg[0] === 'packages' && seg[2] === 'sessions') {
      const pkg = state.packages.find(p => p.id === seg[1]); if (!pkg) return { ok: false, error: '课包不存在' };
      pkg.sessions = pkg.sessions || [];
      if (seg[3]) {
        const s = pkg.sessions.find(x => x.id === seg[3]); if (!s) return { ok: false, error: '课次不存在' };
        if (method === 'PUT') { if (body.status) s.status = body.status; if (body.note !== undefined) s.note = body.note; if (body.plannedDate) { s.plannedDate = body.plannedDate; s.weekday = new Date(body.plannedDate + 'T00:00:00').getDay(); } if (body.start) s.start = body.start; if (body.end) s.end = body.end; if (body.hours != null) s.hours = Number(body.hours) || 1; s.updatedAt = new Date().toISOString(); await commit(); return ok({ ...pkg, stats: packageStats(pkg) }); }
        if (method === 'DELETE') { pkg.sessions = pkg.sessions.filter(x => x.id !== seg[3]); await commit(); return ok({ ...pkg, stats: packageStats(pkg) }); }
      }
      if (method === 'POST') { pkg.sessions.push({ id: uid('s'), idx: pkg.sessions.length, plannedDate: body.plannedDate || ymd(new Date()), weekday: body.weekday != null ? Number(body.weekday) : new Date((body.plannedDate || ymd(new Date())) + 'T00:00:00').getDay(), start: body.start || (pkg.schedule[0] && pkg.schedule[0].start) || '', end: body.end || (pkg.schedule[0] && pkg.schedule[0].end) || '', status: body.status || 'sc', rescheduled: !!body.rescheduled, makeupOf: body.makeupOf || null, hours: body.hours != null ? Number(body.hours) : (Number(pkg.hoursEach) || 1), note: body.note || '', createdAt: new Date().toISOString() }); await commit(); return ok({ ...pkg, stats: packageStats(pkg) }); }
    }

    // 每日评价
    if (seg[0] === 'daily-ratings' && method === 'POST') {
      const gradeId = body.gradeId || (state.grades && (state.grades.find(g => g.current) || state.grades[0] || {}).id) || '';
      const date = body.date || ymd(new Date()); if (!date) return { ok: false, error: '缺少日期' };
      state.dailyRatings = state.dailyRatings || [];
      let r = state.dailyRatings.find(x => x.gradeId === gradeId && x.date === date);
      if (!r) { r = { id: uid('dr'), gradeId, date, createdAt: new Date().toISOString() }; state.dailyRatings.push(r); }
      r.att = body.att != null ? Number(body.att) : (r.att || 0);
      r.meth = body.meth != null ? Number(body.meth) : (r.meth || 0);
      r.eff = body.eff != null ? Number(body.eff) : (r.eff || 0);
      r.by = body.by || r.by || ''; r.updatedAt = new Date().toISOString();
      await commit(); return ok(r);
    }

    // 作业打卡
    if (seg[0] === 'checkin' && method === 'POST' && seg[1]) {
      const hw = state.homeworks.find(h => h.id === seg[1]); if (!hw) return { ok: false, error: '作业不存在' };
      if (body.cancel) {
        hw.status = 'todo'; hw.checkinAt = null; hw.checkinNote = ''; hw.checkinBy = ''; hw.images = [];
        hw.att = null; hw.meth = null; hw.eff = null; hw.qual = null; hw.quality = null;
        state.checkins = state.checkins.filter(c => c.homeworkId !== hw.id);
      } else {
        hw.status = 'done'; hw.checkinAt = new Date().toISOString(); hw.checkinNote = body.note || ''; hw.checkinBy = body.by || ''; hw.duration = body.duration || null;
        hw.qual = body.qual != null ? Number(body.qual) : (hw.qual || null);
        hw.att = null; hw.meth = null; hw.eff = null; hw.quality = null;
        if (Array.isArray(body.images)) hw.images = body.images;
        const stars = Number(hw.qual) || 0;
        state.checkins = state.checkins.filter(c => c.homeworkId !== hw.id);
        state.checkins.push({ id: uid('c'), homeworkId: hw.id, subject: hw.subject, date: hw.checkinAt, by: hw.checkinBy, stars, qual: hw.qual });
      }
      await commit(); return ok(hw);
    }

    // 图片上传（无 R2 → 直接回传 base64 dataURL）
    if (seg[0] === 'upload' && method === 'POST') {
      const m = /^data:(image\/(png|jpe?g|webp|gif));base64,(.+)$/i.exec(body.dataUrl || '');
      if (!m) return { ok: false, error: '图片格式不支持' };
      return ok({ url: body.dataUrl });
    }

    // 示例 / 清空 / 导出 / 导入
    if (seg[0] === 'demo' && method === 'POST') { const g = currentGrade(state); if (!g) return { ok: false, error: '请先创建年级' }; seedDemo(state, g.id); migrateGrades(state); await commit(); return ok({ ok: true }); }
    if (seg[0] === 'clear' && method === 'POST') { const g = currentGrade(state); if (!g) return { ok: false, error: '没有可清空的年级' }; state.courses = state.courses.filter(c => c.gradeId !== g.id); state.packages = state.packages.filter(p => p.gradeId !== g.id); state.homeworks = state.homeworks.filter(h => h.gradeId !== g.id); state.exams = state.exams.filter(e => e.gradeId !== g.id); await commit(); return ok({ ok: true }); }
    if (seg[0] === 'export' && method === 'GET') return ok(state);
    if (seg[0] === 'import' && method === 'POST') { if (!body || !Array.isArray(body.grades)) return { ok: false, error: '备份文件格式不正确' }; S.data = reconcile(body); S.data.version = APP_VERSION; await commit(); return ok({ ok: true }); }

    // 通用集合 CRUD（courses/packages/exams/members/grades/homeworks/checkins/dailyRatings）
    const col = seg[0];
    if (COLLECTIONS.includes(col)) {
      const list = state[col];
      if (method === 'GET') return ok(list);
      if (method === 'POST') { const item = { id: uid(col[0]), createdAt: new Date().toISOString(), ...body }; if (col === 'packages') item.records = item.records || []; if (col === 'grades') { if (item.current) state.grades.forEach(g => g.current = false); item.archived = !!item.archived; } list.push(item); await commit(); return ok(col === 'packages' ? { ...item, stats: packageStats(item) } : item); }
      if (method === 'PUT' && seg[1]) { const i = list.findIndex(x => x.id === seg[1]); if (i < 0) return { ok: false, error: '记录不存在' }; list[i] = { ...list[i], ...body, id: list[i].id, updatedAt: new Date().toISOString() }; if (col === 'grades' && body.current) state.grades.forEach(g => { if (g.id !== seg[1]) g.current = false; }); await commit(); return ok(col === 'packages' ? { ...list[i], stats: packageStats(list[i]) } : list[i]); }
      if (method === 'DELETE' && seg[1]) { const i = list.findIndex(x => x.id === seg[1]); if (i < 0) return { ok: false, error: '记录不存在' }; const [removed] = list.splice(i, 1); if (col === 'grades') { state.courses = state.courses.filter(c => c.gradeId !== removed.id); state.packages = state.packages.filter(p => p.gradeId !== removed.id); state.homeworks = state.homeworks.filter(h => h.gradeId !== removed.id); state.exams = state.exams.filter(e => e.gradeId !== removed.id); if (removed.current && state.grades[0]) state.grades[0].current = true; } if (col === 'grades' || col === 'homeworks') { state.checkins = state.checkins.filter(c => state.homeworks.some(h => h.id === c.homeworkId)); } if (col === 'courses') state.homeworks.forEach(h => { if (h.courseId === removed.id) h.courseId = null; }); await commit(); return ok(removed); }
    }

    return { ok: false, error: '接口不存在：/api' + path };
  }

  /* 轮询同步（替代 WebSocket 实时通道） */
  async function syncOnce() {
    if (!S.token || !S.data || syncing) return;
    syncing = true;
    try {
      const st = await ghGet();
      if (st && ghSha) {
        const fresh = reconcile(st);
        if (JSON.stringify(fresh) !== JSON.stringify(S.data)) {
          S.data = fresh;
          if (typeof refresh === 'function') refresh().catch(() => {});
        }
      }
    } catch (_) { } finally { syncing = false; }
  }
  let timer = null;
  function startSync() {
    if (timer) return;
    timer = setInterval(syncOnce, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) syncOnce(); });
  }

  window.__GH_API = { api: ghApi, syncOnce, startSync };
})();
