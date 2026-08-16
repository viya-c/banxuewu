// 星光伴学屋 · Cloudflare Worker 业务逻辑层（从 server.js 忠实移植）
// 纯函数 + 数据，不依赖文件系统（宠物库改由 pets.json 提供）
export const APP_VERSION = '1.0.21';
export const BUILD_NO = '20260816b';
export const HOUSEHOLD_ID = 'default';

/* ---------------------------- 工具 ---------------------------- */
export function uid(p = 'id') {
  const b = new Uint8Array(3);
  crypto.getRandomValues(b);
  const hex = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return p + '_' + Date.now().toString(36) + '_' + hex;
}
function hmToMin(hm) { if (!hm) return 0; const [h, m] = String(hm).split(':').map(Number); return (h || 0) * 60 + (m || 0); }
function minToHm(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mm = m % 60; return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); }
export function endFromStart(start, durMin) { return minToHm(hmToMin(start) + (Number(durMin) || 0)); }
/** 本地日期转 YYYY-MM-DD（避免 toISOString 的 UTC 偏移导致跨天错位） */
export function ymd(d) { d = d instanceof Date ? d : new Date(d); if (isNaN(d)) return ''; const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }

/* ---------------------------- 常量 ---------------------------- */
export const COLLECTIONS = ['members', 'grades', 'courses', 'packages', 'homeworks', 'exams', 'checkins', 'dailyRatings'];

/* ---------------------------- 学年 / 学期 ---------------------------- */
function schoolYearRange(sy) {
  const m = String(sy || '').match(/(\d{4})\s*-\s*(\d{4})/);
  if (m) return { y0: +m[1], y1: +m[2] };
  const y = new Date().getFullYear();
  return { y0: y, y1: y + 1 };
}
export function schoolYearOf(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const y = d.getFullYear();
  const sy = d.getMonth() >= 8 ? y : y - 1;
  return sy + '-' + (sy + 1);
}
export function defaultTermSegments(sy) {
  const { y0, y1 } = schoolYearRange(sy);
  return [
    { id: 't1', name: '上学期', start: `${y0}-09-01`, end: `${y1}-01-20` },
    { id: 't2', name: '寒假', start: `${y1}-01-21`, end: `${y1}-02-15` },
    { id: 't3', name: '下学期', start: `${y1}-02-16`, end: `${y1}-07-05` },
    { id: 't4', name: '暑假', start: `${y1}-07-06`, end: `${y1}-08-31` }
  ];
}

/* ---------------------------- 课包计算 ---------------------------- */
export function packageStats(pkg) {
  const total = Number(pkg.totalHours) || 0;
  const hoursEach = Number(pkg.hoursEach) || 1;
  const sessions = pkg.sessions || [];
  if (sessions.length) {
    const consumed = sessions.reduce((s, x) => {
      if (x.status === 'at' || x.status === 'mk') return s + (Number(x.hours) || hoursEach);
      if (x.status === 'lv' && pkg.leaveRule === 'deduct') return s + (Number(x.hours) || hoursEach);
      return s;
    }, 0);
    const attended = sessions.filter(x => x.status === 'at').length;
    const makeup = sessions.filter(x => x.status === 'mk').length;
    const leave = sessions.filter(x => x.status === 'lv').length;
    const cancelled = sessions.filter(x => x.status === 'no').length;
    const remain = Math.max(0, total - consumed);
    return {
      total, consumed, remain, leave, makeup, attended, cancelled,
      scheduled: sessions.filter(x => x.status === 'sc').length,
      percent: total ? Math.round(consumed / total * 100) : 0
    };
  }
  const recs = pkg.records || [];
  const used = recs.filter(r => r.type === 'consume').reduce((s, r) => s + (Number(r.hours) || 1), 0);
  const leave = recs.filter(r => r.type === 'leave').length;
  const makeup = recs.filter(r => r.type === 'makeup').reduce((s, r) => s + (Number(r.hours) || 1), 0);
  const consumed = used;
  const remain = Math.max(0, total - consumed);
  return { total, consumed, remain, leave, makeup, attended: used, cancelled: 0, scheduled: Math.max(0, total - used), percent: total ? Math.round(consumed / total * 100) : 0 };
}
function fixSessionDate(s) {
  if (!s.plannedDate || s.weekday == null) return;
  const wd = Number(s.weekday);
  const cur = new Date(s.plannedDate + 'T00:00:00');
  if (isNaN(cur) || cur.getDay() === wd) return;
  for (let off = 1; off <= 7; off++) {
    const a = new Date(cur); a.setDate(a.getDate() - off);
    const b = new Date(cur); b.setDate(b.getDate() + off);
    if (a.getDay() === wd) { s.plannedDate = ymd(a); return; }
    if (b.getDay() === wd) { s.plannedDate = ymd(b); return; }
  }
}
export function migratePackages(DB) {
  if (!DB.packages) return;
  DB.packages.forEach(p => {
    if (!Array.isArray(p.schedule)) p.schedule = [];
    if (p.hoursEach == null) p.hoursEach = 1;
    if (!p.leaveRule) p.leaveRule = 'keep';
    if (p.durationMin == null) {
      const s0 = (p.schedule && p.schedule[0]) || {};
      p.durationMin = (s0.end && s0.start) ? (hmToMin(s0.end) - hmToMin(s0.start)) : 90;
    }
    if (!Array.isArray(p.sessions)) p.sessions = [];
    if (!Array.isArray(p.records)) p.records = [];
    (p.sessions || []).forEach(s => { if (!s.end && s.start) s.end = endFromStart(s.start, p.durationMin); });
    (p.sessions || []).forEach(fixSessionDate);
  });
}
export function projectEndDate(pkg) {
  const sched = (pkg.schedule && pkg.schedule.length) ? pkg.schedule : null;
  const target = Math.ceil((Number(pkg.totalHours) || 0) / (Number(pkg.hoursEach) || 1));
  if (!sched || !target) return null;
  const start = pkg.startDate ? new Date(pkg.startDate + 'T00:00:00') : new Date();
  const d = new Date(start);
  let made = 0, guard = 0, last = null;
  while (made < target && guard++ < 3000) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (sched.some(s => Number(s.weekday) === wd)) { made++; last = ymd(d); }
  }
  return last;
}
export function ensureSessions(pkg) {
  pkg.sessions = pkg.sessions || [];
  const target = Math.ceil((Number(pkg.totalHours) || 0) / (Number(pkg.hoursEach) || 1));
  if (!target) return pkg.sessions.length;
  const sched = (pkg.schedule && pkg.schedule.length) ? pkg.schedule : null;
  if (!sched) return pkg.sessions.length;
  (pkg.sessions || []).forEach(s => { if (s.start && s.status !== 'at') s.end = endFromStart(s.start, pkg.durationMin); });
  if (pkg.sessions.length >= target) return pkg.sessions.length;
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  let start;
  if (pkg.sessions.length) {
    const last = pkg.sessions.reduce((m, s) => (s.plannedDate > m ? s.plannedDate : m), '');
    start = new Date(last + 'T00:00:00');
  } else {
    start = pkg.startDate ? new Date(pkg.startDate + 'T00:00:00') : today0;
  }
  const end = pkg.endDate ? new Date(pkg.endDate + 'T00:00:00') : null;
  let count = pkg.sessions.length;
  const d = new Date(start);
  let guard = 0;
  while (count < target && guard++ < 1000) {
    d.setDate(d.getDate() + 1);
    if (end && d > end) break;
    const wd = d.getDay();
    const slot = sched.find(s => Number(s.weekday) === wd);
    if (slot) {
      const plannedDate = ymd(d);
      if (pkg.sessions.some(s => s.plannedDate === plannedDate)) continue;
      const past = d < today0;
      pkg.sessions.push({
        id: uid('s'), idx: pkg.sessions.length,
        plannedDate: ymd(d),
        weekday: wd, start: slot.start, end: slot.end || endFromStart(slot.start, pkg.durationMin),
        status: past ? 'at' : 'sc', rescheduled: false, makeupOf: null,
        hours: Number(pkg.hoursEach) || 1, note: past ? '已上课' : '',
        createdAt: new Date().toISOString()
      });
      count++;
    }
  }
  if (!pkg.endDate && pkg.sessions.length) pkg.endDate = pkg.sessions[pkg.sessions.length - 1].plannedDate;
  return count;
}
export function nextFreeSlot(pkg, from) {
  const sched = pkg.schedule || [];
  const occupied = new Set((pkg.sessions || []).map(x => x.plannedDate));
  let d = from && from.plannedDate ? new Date(from.plannedDate + 'T00:00:00') : new Date();
  let guard = 0;
  while (guard++ < 400) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (sched.some(s => Number(s.weekday) === wd) && !occupied.has(ymd(d))) return ymd(d);
  }
  const fallback = new Date((from && from.plannedDate ? from.plannedDate : new Date()) + 'T00:00:00');
  fallback.setDate(fallback.getDate() + 7);
  return ymd(fallback);
}

/** 重排未来待上课次到新周几（对应 server.js reschedule-future）。返回移动的课次数量 */
export function rescheduleFuture(pkg) {
  const sched = pkg.schedule || [];
  if (!sched.length) return 0;
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const pend = (pkg.sessions || [])
    .filter(s => s.status === 'sc')
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
  let lastDate = t0;
  const ats = (pkg.sessions || []).filter(s => s.status === 'at');
  if (ats.length) {
    const lastAt = ats.reduce((m, s) => (s.plannedDate > m ? s.plannedDate : m), '');
    lastDate = new Date(lastAt + 'T00:00:00');
  }
  for (const s of pend) {
    let d = new Date(lastDate.getTime());
    let guard = 0;
    while (guard++ < 400) {
      d.setDate(d.getDate() + 1);
      const wd = d.getDay();
      const slot = sched.find(x => Number(x.weekday) === wd);
      if (slot) {
        s.plannedDate = ymd(d); s.weekday = wd;
        s.start = slot.start; s.end = slot.end || endFromStart(slot.start, pkg.durationMin);
        s.rescheduled = false; s.origDate = null;
        lastDate = new Date(d.getTime());
        break;
      }
    }
  }
  return pend.length;
}

/* ---------------------------- 年级 / 迁移 ---------------------------- */
export function currentGrade(DB) { return DB.grades.find(g => g.current) || DB.grades[0]; }
export function migrateGrades(DB) {
  (DB.grades || []).forEach(g => {
    const defs = defaultTermSegments(g.schoolYear);
    if (!Array.isArray(g.terms) || !g.terms.length) {
      g.terms = defs;
    } else {
      const exById = {}, exByName = {};
      g.terms.forEach(t => { exById[t.id] = t; if (t.name) exByName[t.name] = t; });
      g.terms = defs.map(d => {
        const ex = exById[d.id] || exByName[d.name] || null;
        return ex ? { id: ex.id, name: ex.name || d.name, start: ex.start || d.start, end: ex.end || d.end } : d;
      });
    }
    if (!g.currentTermId || !g.terms.some(t => t.id === g.currentTermId)) g.currentTermId = g.terms[0].id;
    const def = g.currentTermId;
    (DB.courses || []).filter(c => c.gradeId === g.id && !c.termId).forEach(c => { c.termId = def; });
  });
}
export function dedupeCourses(DB) {
  if (!Array.isArray(DB.courses)) return;
  const seen = new Set();
  const keep = [];
  for (const c of DB.courses) {
    const key = [c.gradeId, c.type, c.subject, c.name, c.weekday, c.periodIdx ?? null, c.startTime || '', c.endTime || ''].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    keep.push(c);
  }
  if (keep.length !== DB.courses.length) DB.courses = keep;
}

/* ---------------------------- 示例数据 ---------------------------- */

export function seedDemo(DB, gradeId) {
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return ymd(x); };
  const mk = (o) => ({ id: uid('x'), gradeId, createdAt: new Date().toISOString(), ...o });
  DB.courses = [
    mk({ type: 'school', subject: '语文', name: '语文', weekday: 1, periodIdx: 0, startTime: '08:00', endTime: '08:40', teacher: '王老师', location: '教学楼201', color: '#EF476F' }),
    mk({ type: 'school', subject: '数学', name: '数学', weekday: 2, periodIdx: 1, startTime: '08:50', endTime: '09:30', teacher: '李老师', location: '教学楼202', color: '#118AB2' }),
    mk({ type: 'school', subject: '英语', name: '英语', weekday: 3, periodIdx: 2, startTime: '09:50', endTime: '10:30', teacher: '张老师', location: '教学楼203', color: '#FFD166' }),
    mk({ type: 'extend', subject: '延时', name: '延时作业', weekday: 1, periodIdx: 0, startTime: '16:10', endTime: '17:00', color: '#06D6A0' })
  ];
  DB.packages = [{
    id: uid('p'), gradeId, name: '数学培优课', subject: '数学', totalHours: 48, hoursEach: 2,
    leaveRule: 'keep', durationMin: 120, startDate: ymd(new Date()), schedule: [
      { weekday: 3, start: '18:30', end: '20:30' }, { weekday: 6, start: '10:00', end: '12:00' }
    ], sessions: [], records: [], color: '#7C4DFF'
  }];
  DB.homeworks = [
    mk({ type: 'school', subject: '语文', title: '生字抄写2遍 + 背诵古诗', dueDate: d(0), dueTime: '20:30', status: 'todo', courseId: null }),
    mk({ type: 'school', subject: '数学', title: '口算100题', dueDate: d(1), dueTime: '21:00', status: 'todo', courseId: null }),
    mk({ type: 'extend', subject: '英语', title: '英语绘本阅读30分钟', dueDate: d(2), dueTime: '21:00', status: 'todo', courseId: null })
  ];
  DB.exams = [
    mk({ subject: '数学', type: '单元测', name: '第三单元测试', date: d(5), score: null, full: 100 }),
    mk({ subject: '语文', type: '期中', name: '期中考试', date: d(12), score: null, full: 100 })
  ];

}

/* ---------------------------- 默认数据 ---------------------------- */
export function defaultData() {
  const gradeId = uid('g');
  return {
    version: APP_VERSION,
    createdAt: new Date().toISOString(),
    family: { name: '我们家', childName: '宝贝', childAvatar: '🌸', accessCode: '2026' },
    members: [
      { id: uid('m'), name: '爸爸', role: 'admin', avatar: '👨' },
      { id: uid('m'), name: '妈妈', role: 'admin', avatar: '👩' },
      { id: uid('m'), name: '宝贝', role: 'child', avatar: '🌸' }
    ],
    grades: [
      { id: gradeId, name: '三年级', schoolYear: schoolYearOf(), current: true, archived: false,
        terms: defaultTermSegments(schoolYearOf()), currentTermId: 't1', createdAt: new Date().toISOString() }
    ],
    settings: {
      periods: [
        { name: '第1节', start: '08:00', end: '08:40' },
        { name: '第2节', start: '08:50', end: '09:30' },
        { name: '第3节', start: '09:50', end: '10:30' },
        { name: '第4节', start: '10:40', end: '11:20' },
        { name: '第5节', start: '13:30', end: '14:10' },
        { name: '第6节', start: '14:20', end: '15:00' },
        { name: '第7节', start: '15:10', end: '15:50' }
      ],
      extendPeriods: [
        { name: '延时1', start: '16:10', end: '17:00' },
        { name: '延时2', start: '17:10', end: '18:00' }
      ],
      showWeekend: false,
      reminders: {
        classBefore: 30, homeworkBefore: 60, packageLowHours: 6, examBefore: 1,
        enableClass: true, enableHomework: true, enablePackage: true, enableExam: true, browserPush: true
      },
      subjects: ['语文', '数学', '英语', '科学', '体育', '音乐', '美术', '道法', '信息', '奥数', '书法', '编程', '钢琴', '游泳', '舞蹈', '其他']
    },
    courses: [], packages: [], homeworks: [], exams: [], checkins: [], dailyRatings: [],
    changelog: [
      { version: '1.0.21', date: '2026-08-16', items: ['彻底移除「萌宠卡」功能：删除萌宠库、召唤逻辑、专属头像与图片资源', '同步清理 Worker 部署代码，数据集合去除 cards'] },
      { version: '1.0.20', date: '2026-08-12', items: ['前端接入实时同步（WebSocket）', 'API 基地址可配置（config.js）', '部署改造 M4'] },
      { version: '1.0.19', date: '2026-08-07', items: ['萌宠卡「召唤日期」精确到分钟', '演示数据生成的萌宠卡扩展到 100 张'] },
      { version: '1.0.18', date: '2026-08-06', items: ['萌宠配色与台词更活泼', '新增 4 种表情', '演示数据 20 只萌宠卡'] },
      { version: '1.0.0', date: '2026-08-02', items: ['首个版本发布'] }
    ]
  };
}

/** 版本兼容：补齐缺失字段（对应 server.js loadData） */
export function reconcile(DB) {
  const def = defaultData();
  for (const k of Object.keys(def)) if (DB[k] === undefined) DB[k] = def[k];
  for (const k of Object.keys(def.settings)) if (DB.settings[k] === undefined) DB.settings[k] = def.settings[k];
  for (const k of Object.keys(def.settings.reminders)) {
    if (DB.settings.reminders[k] === undefined) DB.settings.reminders[k] = def.settings.reminders[k];
  }
  migratePackages(DB);
  migrateGrades(DB);
  dedupeCourses(DB);
  DB.version = APP_VERSION;
  const dl = defaultData();
  if (!(DB.changelog || []).some(c => c.version === APP_VERSION)) DB.changelog = [dl.changelog[0], ...(DB.changelog || [])];
  return DB;
}
