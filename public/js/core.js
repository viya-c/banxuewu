/* ============ 核心：状态 / 请求 / 工具 / 弹层 ============ */
const S = {
  data: null,
  meta: { version: '1.0.0', build: '' },
  page: 'timetable',
  token: localStorage.getItem('sm_token') || '',
  who: localStorage.getItem('sm_who') || '',
  role: '',            // 当前使用者角色：admin(管理员) / child(二类·打卡+录成绩) / viewer(三类·只读)
  ttView: 'week',
  ttWeek: 'all',
  ttWeekOffset: 0,   // 课表「看第几周」偏移（0=当周），左右滑动改变
  examSubject: '',
  notified: new Set(JSON.parse(sessionStorage.getItem('sm_notified') || '[]'))
};

/* ---------- 角色 / 权限 ---------- */
// 角色语义（与「我的→家庭成员」里的权限一致）：
//   admin  = 一类管理员：可编辑全部
//   child  = 二类学员：仅「打卡(作业完成)」+「录入成绩」，其余只读
//   viewer = 三类访客：全部只读
const ROLE_INFO = {
  admin: { t: '管理员', sub: '可编辑全部', cls: 'b', tier: '一类' },
  child: { t: '学员', sub: '可打卡 · 录成绩', cls: 'g', tier: '二类' },
  viewer: { t: '访客', sub: '只读查看', cls: 'gy', tier: '三类' }
};
const roleInfo = r => ROLE_INFO[r] || ROLE_INFO.viewer;
const roleLabel = r => { const o = roleInfo(r); return `${o.t} · ${o.sub}`; };

// 某个操作是否允许当前角色执行
//   course  课程/课表/作息/批量录入（管理员）
//   homework 记作业/编辑作业（管理员）
//   checkin 作业打卡（管理员 + 二类）
//   exam    录入/编辑成绩（管理员 + 二类）
//   package 课包/课次管理（管理员）
//   settings 家庭/成员/年级/提醒/数据（管理员）
function canEdit(scope) {
  const role = S.role || 'viewer';
  if (role === 'admin') return true;
  if (role === 'child') return scope === 'checkin' || scope === 'exam';
  return false;
}
// 进入编辑前的权限闸门：无权限时提示并返回 false
function needRole(scope, label) {
  if (canEdit(scope)) return true;
  toast(label || '当前身份没有编辑权限，如需修改请联系管理员');
  return false;
}
// 仅管理员可执行的判断（删除成绩 / 删除课程等）
const isAdmin = () => S.role === 'admin';
// 当前身份变化后，依据成员列表重新推导角色（成员可能被改名/改权限）
function syncRole() {
  if (!S.who || !S.data) { S.role = ''; return; }
  const m = S.data.members.find(x => x.name === S.who);
  S.role = m ? m.role : 'viewer';
  localStorage.setItem('sm_role', S.role);
}

const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WD_S = ['日', '一', '二', '三', '四', '五', '六'];
const TYPE_NAME = { main: '学校正课', extend: '延时课', tutor: '课外辅导' };
const TYPE_TAG = { main: 'b', extend: 'o', tutor: 'p' };
const TYPE_EMOJI = { main: '🏫', extend: '🌇', tutor: '🎯' };
// 课包「学期/阶段」预设（课外辅导课包跨学期、寒暑假时使用）
const TERM_PRESETS = [
  { v: 's1', t: '上学期' }, { v: 's2', t: '下学期' },
  { v: 'winter', t: '寒假' }, { v: 'summer', t: '暑假' },
  { v: 'all', t: '全年/长线' }, { v: 'custom', t: '自定义' }
];
const termLabel = v => { const o = TERM_PRESETS.find(x => x.v === v); return o ? o.t : (v || ''); };
const SUBJ_EMOJI = {
  语文: '📖', 数学: '🔢', 英语: '🔤', 科学: '🔬', 体育: '⚽', 音乐: '🎵', 美术: '🎨',
  道法: '⚖️', 信息: '💻', 奥数: '🧮', 书法: '🖌️', 编程: '👨‍💻', 钢琴: '🎹', 游泳: '🏊',
  舞蹈: '💃', 阅读: '📚', 围棋: '⚫', 篮球: '🏀', 其他: '📌'
};
const emojiOf = s => SUBJ_EMOJI[s] || '📌';

/* ---------- 请求 ---------- */
// API 基地址：本地运行（node server.js）走同源，留空即可；
// 部署到 GitHub Pages + Cloudflare Workers 时，由 public/js/config.js 设置 window.__API_BASE。
const API_BASE = (function () {
  if (window.__API_BASE) return String(window.__API_BASE).replace(/\/+$/, '');
  if (location.hostname.endsWith('github.io')) {
    console.warn('[星光伴学屋] 运行在 GitHub Pages，但未配置 Worker 地址。请在 public/js/config.js 中填写 window.__API_BASE，否则无法读取数据。');
  }
  return '';
})();
// 拼出完整接口地址：apiURL('/api/state') → (API_BASE)+'/api/state'
const apiURL = p => API_BASE + p;

async function api(path, opt = {}) {
  const res = await fetch(apiURL('/api' + path), {
    method: opt.method || 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Access-Code': S.token },
    body: opt.body ? JSON.stringify(opt.body) : undefined
  });
  let j;
  try { j = await res.json(); } catch (_) { throw new Error('服务器响应异常'); }
  if (res.status === 401) { logout(); throw new Error(j.error || '未授权'); }
  if (!j.ok) throw new Error(j.error || '操作失败');
  return j;
}

/* ---------- 实时同步（WebSocket） ----------
   仅在配置了 API_BASE（即部署到 Worker）时启用；本地 server.js 不支持 WS，自动降级为
   visibilitychange 回到前台刷新（现有行为）。收到后端广播的 {type:'sync'} 即重新拉取状态。 */
const RT = { ws: null, retry: 0, timer: null, lastSync: 0 };
function connectRealtime() {
  if (RT.ws || !API_BASE || !S.token) return;        // 本地 / 未部署 / 未登录 → 不连
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = API_BASE.replace(/^https?:/, proto) + '/api/ws?token=' + encodeURIComponent(S.token);
  try {
    const ws = new WebSocket(url);
    RT.ws = ws;
    ws.onopen = () => { RT.retry = 0; console.log('[实时同步] 已连接'); };
    ws.onmessage = ev => {
      try {
        const m = JSON.parse(ev.data);
        if (m && m.type === 'sync') {
          const now = Date.now();
          if (now - RT.lastSync < 800) return;       // 去抖：避免同一写操作触发多次刷新
          RT.lastSync = now;
          if (S.data) refresh().catch(() => { });
        }
      } catch (_) { }
    };
    ws.onclose = () => { RT.ws = null; scheduleReconnect(); };
    ws.onerror = () => { try { ws.close(); } catch (_) { } };
  } catch (_) { scheduleReconnect(); }
}
function scheduleReconnect() {
  if (!API_BASE || !S.token || RT.timer) return;
  const delay = Math.min(1000 * 2 ** RT.retry, 15000); // 指数退避，上限 15s
  RT.retry++;
  RT.timer = setTimeout(() => { RT.timer = null; connectRealtime(); }, delay);
}
function disconnectRealtime() {
  if (RT.timer) { clearTimeout(RT.timer); RT.timer = null; }
  if (RT.ws) { try { RT.ws.close(); } catch (_) { } RT.ws = null; }
  RT.retry = 0;
}

async function loadState() {
  const j = await api('/state');
  S.data = j.data;
  S.meta = j.meta;
  syncRole();        // 依据成员列表推导当前使用者角色
  syncTodayTerm();   // 打开应用：当前学期落到「今天」所在时段
  return S.data;
}

function logout() {
  disconnectRealtime();
  localStorage.removeItem('sm_token');
  S.token = '';
  document.getElementById('login').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('nav').style.display = 'none';
}

/* ---------- 工具 ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, ms = 2000) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('on'), ms);
}

const pad2 = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const nowHM = () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const toMin = hm => { if (!hm) return 0; const [h, m] = String(hm).split(':').map(Number); return h * 60 * 1 + (m || 0); };
const minToHM = m => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (isNaN(d)) return s;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
/** 完整日期 YYYY年M月D日（开课日 / 有效期截止日 用） */
function fmtDateFull(s) {
  if (!s) return '';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (isNaN(d)) return s;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
function fmtDateTime(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return s;
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function relDays(dateStr) {
  const a = new Date(today() + 'T00:00:00'), b = new Date(dateStr.slice(0, 10) + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}
/** 当前是学年第几周（用于单双周判断） */
function weekParity() {
  const g = curGrade();
  const start = g && g.startDate ? new Date(g.startDate + 'T00:00:00') : new Date(new Date().getFullYear() + '-09-01T00:00:00');
  const diff = Math.floor((new Date(today() + 'T00:00:00') - start) / 86400000);
  const wk = Math.floor(diff / 7) + 1;
  return { week: wk, parity: wk % 2 === 1 ? 'odd' : 'even' };
}

const curGrade = () => (S.data ? (S.data.grades.find(g => g.current) || S.data.grades[0]) : null);
const gid = () => { const g = curGrade(); return g ? g.id : ''; };

// 年级是否配置了学期/阶段：未配置时不做学期过滤（避免把所有课/作业/成绩都藏起来）
const gradeHasTerms = () => curGradeTerms().length > 0;
const gradeHasTermDates = () => curGradeTerms().some(t => t.start && t.end);

// 某节课是否属于指定学期（用于过滤）
const courseInTerm = (c, termId) => {
  if (c.type === 'tutor') {
    const pk = S.data.packages.find(p => p.id === c.packageId);
    // 课外辅导以「课包有效期」为准（忽略 v1.0.8 遗留的手填学期，避免和课包标签不一致）
    if (pk && pk.startDate && pk.endDate) return termOverlaps(pk.startDate, pk.endDate, termId);
    if (c.termId) return c.termId === termId;                                   // 无有效期时退回手填学期
    return true;                                                                // 无课包/无限期 → 长线，始终显示
  }
  return c.termId == null || c.termId === termId;
};

const gCourses = () => S.data.courses.filter(c => c.gradeId === gid() && (!gradeHasTerms() || courseInTerm(c, curTerm())));
const gPackages = () => S.data.packages.filter(p => p.gradeId === gid());
const gHomeworks = () => S.data.homeworks.filter(h => h.gradeId === gid() && (!gradeHasTerms() || h.termId == null || h.termId === curTerm()));
const gExams = () => S.data.exams.filter(e => e.gradeId === gid() && (!gradeHasTerms() || e.termId == null || e.termId === curTerm()));

/* ---------- 学期（年级下的 上学期/寒假/下学期/暑假 等，带日期区间） ---------- */
const curGradeTerms = () => { const g = curGrade(); return g && Array.isArray(g.terms) ? g.terms : []; };
const curTerm = () => { const g = curGrade(); return g && g.currentTermId ? g.currentTermId : ''; };
const curTermName = () => { const t = curGradeTerms().find(x => x.id === curTerm()); return t ? t.name : ''; };

// 日期区间是否覆盖某时段
const termOverlaps = (start, end, termId) => {
  const t = curGradeTerms().find(x => x.id === termId);
  if (!t || !t.start || !t.end || !start || !end) return true;
  const s = start < t.start ? t.start : start;
  const e = end > t.end ? t.end : end;
  return s <= e;
};
// 某日期所在时段（用于「今天」自动判定）
const activeTermOf = (dateStr, g) => {
  const gd = g || curGrade(); if (!gd || !Array.isArray(gd.terms)) return null;
  const d = dateStr || today();
  return gd.terms.find(t => t.start && t.end && d >= t.start && d <= t.end) || null;
};
const todayTerm = () => activeTermOf(today(), curGrade());
const todayTermId = () => { const t = todayTerm(); return t ? t.id : ''; };
// 某日期所在自然周的周一（YYYY-MM-DD）。getDay() 周日=0，故用 (d+6)%7 偏移
const mondayOf = (dateStr) => {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  if (isNaN(d)) return '';
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
};
// 某日期是「当前学期第几周」；无学期时回落学年（按年级 startDate）
// termId 指定按哪个学期算（默认取该日期自然所属学期）；before=true 表示该日期早于学期第一周
function termWeekOf(dateStr, termId) {
  const d = dateStr || today();
  const g = curGrade();
  let term = null;
  if (termId) term = (g && g.terms || []).find(t => t.id === termId);
  if (!term) term = activeTermOf(d);
  if (term && term.start) {
    const base = new Date(mondayOf(term.start) + 'T00:00:00');
    const cur = new Date(mondayOf(d) + 'T00:00:00');
    const week = Math.floor((cur - base) / 604800000) + 1;
    const total = term.end ? Math.floor((new Date(mondayOf(term.end) + 'T00:00:00') - base) / 604800000) + 1 : null;
    return { term, week, total, scope: 'term', before: week < 1 };
  }
  const start = g && g.startDate ? new Date(g.startDate + 'T00:00:00') : new Date(new Date().getFullYear() + '-09-01T00:00:00');
  const base = new Date(mondayOf(ymd(start)) + 'T00:00:00');
  const cur = new Date(mondayOf(d) + 'T00:00:00');
  const week = Math.floor((cur - base) / 604800000) + 1;
  return { term: null, week, total: null, scope: 'year', before: week < 1 };
}
// 当前查看周的偏移允许范围（基于所显示学期起止的周一），无学期则基本不限
function weekOffsetBounds() {
  const g = curGrade();
  if (!g || !g.terms || !g.terms.length) return { min: -520, max: 520 };
  const termId = curTerm() || (activeTermOf(today()) && activeTermOf(today()).id) || g.terms[0].id;
  const term = g.terms.find(t => t.id === termId) || g.terms[0];
  if (!term || !term.start) return { min: -520, max: 520 };
  const base = new Date(mondayOf(today()) + 'T00:00:00');
  const minOf = new Date(mondayOf(term.start) + 'T00:00:00');
  const maxOf = new Date(mondayOf(term.end) + 'T00:00:00');
  return {
    min: Math.floor((minOf - base) / 604800000),
    max: Math.floor((maxOf - base) / 604800000)
  };
}
// 打开应用时把当前学期落到「今天」所在时段（每个页面会话只同步一次，手动切换后刷新不跳回）
// 同步结果会写回服务端，避免导航/刷新时又被服务端旧值覆盖
let _termSynced = false;
async function syncTodayTerm() {
  if (_termSynced) return;
  const g = curGrade(); if (!g || !g.terms) return;
  const t = activeTermOf(today(), g);
  if (t) {
    if (g.currentTermId !== t.id) {
      g.currentTermId = t.id;
      try { await api('/grades/' + g.id, { method: 'PUT', body: { currentTermId: t.id } }); } catch (_) { }
    }
    _termSynced = true;
  }
}

// 课包按有效期对照年级时段，推导所属学期/假期标签
const pkgTermLabel = (p) => {
  const segs = curGradeTerms().filter(t => t.start && t.end);
  if (!segs.length || !p.startDate || !p.endDate) return p.term ? termLabel(p.term) : '';
  const ov = segs.map(t => {
    const s = p.startDate < t.start ? t.start : p.startDate;
    const e = p.endDate > t.end ? t.end : p.endDate;
    const days = s <= e ? Math.round((new Date(e) - new Date(s)) / 86400000) + 1 : 0;
    return { t, days };
  }).filter(x => x.days > 0).sort((a, b) => b.days - a.days);
  if (!ov.length) return p.term ? termLabel(p.term) : '全年/长线';
  if (ov.length === 1) return ov[0].t.name;
  return '跨 ' + ov.map(x => x.t.name).join('·');
};

// 客户端默认四个时段（新建年级用）
function defaultTermSegments(sy) {
  const m = String(sy || '').match(/(\d{4})\s*-\s*(\d{4})/);
  const y0 = m ? +m[1] : new Date().getFullYear();
  const y1 = m ? +m[2] : y0 + 1;
  return [
    { id: 't1', name: '上学期', start: `${y0}-09-01`, end: `${y1}-01-20` },
    { id: 't2', name: '寒假', start: `${y1}-01-21`, end: `${y1}-02-15` },
    { id: 't3', name: '下学期', start: `${y1}-02-16`, end: `${y1}-07-05` },
    { id: 't4', name: '暑假', start: `${y1}-07-06`, end: `${y1}-08-31` }
  ];
}

const termSegHTML = () => {
  const terms = curGradeTerms();
  if (terms.length < 2) return '';
  const tt = todayTerm();
  return `<div class="seg" id="termSeg" style="margin:10px 0 4px">${terms.map(t => `<button data-v="${esc(t.id)}" class="${t.id === curTerm() ? 'on' : ''}">${esc(t.name)}${tt && tt.id === t.id ? ' <span style="font-size:10px;opacity:.85">·今天</span>' : ''}</button>`).join('')}</div>`;
};
const bindTermSeg = () => { const ts = document.getElementById('termSeg'); if (ts) ts.onclick = e => { const b = e.target.closest('button'); if (b) switchTerm(b.dataset.v); }; };
async function switchTerm(id) {
  const g = curGrade();
  if (!g) return;
  g.currentTermId = id;
  S.ttWeekOffset = 0; // 切学期回到当周
  try { await api('/grades/' + g.id, { method: 'PUT', body: { currentTermId: id } }); await refresh(); }
  catch (e) { toast(e.message); }
}

/** 课程时间（返回 {start,end}） */
function courseTime(c) {
  if (c.type === 'tutor' || c.customTime) return { start: c.startTime || '', end: c.endTime || '' };
  const arr = c.type === 'extend' ? S.data.settings.extendPeriods : S.data.settings.periods;
  const p = arr[c.periodIdx];
  return p ? { start: p.start, end: p.end } : { start: c.startTime || '', end: c.endTime || '' };
}
function courseTitle(c) {
  return c.name || c.subject || '未命名';
}
/** 某节课当天是否生效（单双周） */
function courseActive(c, parity) {
  if (!c.weekType || c.weekType === 'all') return true;
  return c.weekType === parity;
}

/* ---------- 打卡星星 ---------- */


// 累计星星总数：作业打卡(qual 即 stars) + 每日评价(态度+方法+努力)，跨学期累计
const totalStars = () => {
  if (!S.data) return 0;
  const ck = (S.data.checkins || []).reduce((s, c) => s + (Number(c.stars) || 0), 0);
  const dr = (S.data.dailyRatings || []).reduce((s, r) => s + (Number(r.att) || 0) + (Number(r.meth) || 0) + (Number(r.eff) || 0), 0);
  return ck + dr;
};

// 4 维评星输入控件（态度/方法/努力/完成质量），各 1~5 星，可点选
function starInput(name, val) {
  const v = Number(val) || 0;
  let s = '';
  for (let i = 1; i <= 5; i++) s += `<span class="st ${i <= v ? 'on' : ''}" onclick="setStar('${name}',${i})">${i <= v ? '★' : '☆'}</span>`;
  return `<div class="st-row" id="st_${name}">
    <div class="st-stars" data-name="${name}">${s}</div>
    <input type="hidden" id="stv_${name}" value="${v}"></div>`;
}
// 在详情中展示 4 维评分（只读星）
function rateStarsHTML(label, val) {
  const v = Number(val) || 0;
  let s = '';
  for (let i = 1; i <= 5; i++) s += `<span class="st ${i <= v ? 'on' : ''}">${i <= v ? '★' : '☆'}</span>`;
  return `<div class="rate-row"><span class="rate-lab">${label}</span><span class="st-stars ro">${s}</span></div>`;
}
// 点击星星设置评分（再点同一颗可清零），同步隐藏输入与高亮
function setStar(name, val) {
  const wrap = document.getElementById('st_' + name);
  if (!wrap) return;
  const cur = Number(document.getElementById('stv_' + name).value) || 0;
  const nv = cur === val ? 0 : val;
  document.getElementById('stv_' + name).value = nv;
  wrap.querySelectorAll('.st').forEach((el, i) => el.classList.toggle('on', (i + 1) <= nv));
}



/* ---------- 每日评价（态度/方法/努力，每天一次）---------- */
function dailyRatingFor(date) {
  if (!S.data) return null;
  const d = date || ymd(new Date());
  return (S.data.dailyRatings || []).find(r => r.date === d) || null;
}
async function saveDailyRating(att, meth, eff) {
  const d = ymd(new Date());
  const grade = (S.data && S.data.grades) ? (S.data.grades.find(g => g.current) || S.data.grades[0]) : null;
  const gradeId = grade ? grade.id : '';
  const by = S.who || '';
  const res = await api('/daily-ratings', { method: 'POST', body: { gradeId, date: d, att: Number(att) || 0, meth: Number(meth) || 0, eff: Number(eff) || 0, by } });
  return res && res.data;
}

/* ---------- 弹层 ---------- */
let sheetCb = null;
function openSheet(title, bodyHTML, footHTML, onMount) {
  $('#sheetTitle').textContent = title;
  $('#sheetBody').innerHTML = bodyHTML;
  $('#sheetFoot').innerHTML = footHTML || '';
  $('#mask').classList.add('on');
  document.body.style.overflow = 'hidden';
  $('#sheet').scrollTop = 0;
  bindPicks($('#sheetBody'));
  if (onMount) onMount();
}
function closeSheet() {
  $('#mask').classList.remove('on');
  document.body.style.overflow = '';
  sheetCb = null;
}
function confirmBox(title, text, onYes, yesLabel = '确定删除') {
  openSheet(title, `<p style="font-size:14px;line-height:1.8;color:var(--tx2);padding:6px 2px 12px">${text}</p>`,
    `<button class="btn ghost" onclick="closeSheet()">取消</button><button class="btn warn" id="cfmYes">${yesLabel}</button>`,
    () => { $('#cfmYes').onclick = () => { closeSheet(); onYes(); }; });
}

/** 选择器按钮组交互 */
function bindPicks(root) {
  root.querySelectorAll('.pick').forEach(p => {
    if (p.dataset.bound) return;
    p.dataset.bound = '1';
    p.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (p.dataset.multi === '1') { b.classList.toggle('on'); }
      else { p.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); }
      if (p.dataset.onchange) window[p.dataset.onchange] && window[p.dataset.onchange](b.dataset.v, p);
    });
  });
  root.querySelectorAll('.toggle').forEach(t => {
    if (t.dataset.bound) return;
    t.dataset.bound = '1';
    t.addEventListener('click', () => t.classList.toggle('on'));
  });
}
const pickVal = sel => { const b = document.querySelector(sel + ' button.on'); return b ? b.dataset.v : ''; };
const val = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
const numVal = (id, d = 0) => { const v = parseFloat(val(id)); return isNaN(v) ? d : v; };
const isOn = id => { const e = document.getElementById(id); return e ? e.classList.contains('on') : false; };

/* ---------- 表单片段 ---------- */
function fSelect(id, label, options, cur, required) {
  return `<div class="f"><label>${label}${required ? ' <em>*</em>' : ''}</label>
    <select id="${id}">${options.map(o => {
      const v = typeof o === 'string' ? o : o.v, t = typeof o === 'string' ? o : o.t;
      return `<option value="${esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${esc(t)}</option>`;
    }).join('')}</select></div>`;
}
function fInput(id, label, value, ph, type = 'text', required) {
  return `<div class="f"><label>${label}${required ? ' <em>*</em>' : ''}</label>
    <input id="${id}" type="${type}" value="${esc(value == null ? '' : value)}" placeholder="${esc(ph || '')}"></div>`;
}
function fArea(id, label, value, ph) {
  return `<div class="f"><label>${label}</label><textarea id="${id}" placeholder="${esc(ph || '')}">${esc(value || '')}</textarea></div>`;
}
function fPick(id, label, options, cur, extraClass = '') {
  return `<div class="f"><label>${label}</label><div class="pick ${extraClass}" id="${id}">${
    options.map(o => {
      const v = typeof o === 'string' ? o : o.v, t = typeof o === 'string' ? o : o.t;
      return `<button type="button" data-v="${esc(v)}" class="${String(cur) === String(v) ? 'on' : ''}">${esc(t)}</button>`;
    }).join('')}</div></div>`;
}
function fSwitch(id, title, sub, on) {
  return `<div class="sw"><div class="sw-t">${title}${sub ? `<small>${sub}</small>` : ''}</div>
    <div class="toggle ${on ? 'on' : ''}" id="${id}"></div></div>`;
}
const subjOptions = () => S.data.settings.subjects;

/* ---------- 图片上传 ---------- */
async function pickImages(max = 3) {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = async () => {
      const files = Array.from(inp.files || []).slice(0, max);
      const urls = [];
      for (const f of files) {
        try {
          const dataUrl = await compressImage(f);
          const r = await api('/upload', { method: 'POST', body: { dataUrl } });
          urls.push(r.url);
        } catch (e) { toast('图片上传失败：' + e.message); }
      }
      resolve(urls);
    };
    inp.click();
  });
}
function compressImage(file, maxW = 1080, q = 0.72) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale);
        cv.height = Math.round(img.height * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/jpeg', q));
      };
      img.onerror = reject;
      img.src = fr.result;
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}
