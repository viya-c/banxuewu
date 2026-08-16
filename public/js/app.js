/* ================= 应用入口：路由 / 刷新 / 提醒 ================= */

const RENDER = {
  timetable: renderTimetable,
  today: renderToday,
  package: renderPackages,
  exam: renderExams,
  me: renderMe
};

function go(p) {
  S.page = p;
  if (p === 'timetable') S.ttWeekOffset = 0; // 进入课表回到当周
  $$('.page').forEach(el => el.classList.toggle('on', el.id === 'page-' + p));
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const fab = $('#fab');
  fab.style.display = p === 'me' ? 'none' : 'grid';
  RENDER[p] && RENDER[p]();
  applyRoleUI();
}

async function refresh() {
  await loadState();
  renderTop();
  RENDER[S.page] && RENDER[S.page]();
  renderVersion();
  updateBadge();
  applyRoleUI();
}

function renderTop() {
  const f = S.data.family, g = curGrade();
  $('#tbAva').textContent = f.childAvatar || '🌸';
  $('#tbName').textContent = f.childName || '宝贝';
  $('#gradeName').textContent = g ? g.name : '未设置';

  const wp = termWeekOf(today());
  const d = new Date();
  $('#tbSub').textContent = `${d.getMonth() + 1}月${d.getDate()}日 ${WD[d.getDay()]} · ${wp.term ? wp.term.name + ' ' : ''}第${wp.week > 0 && wp.week < 60 ? wp.week : '—'}周`;

  const cs = todayCourses();
  const todo = gHomeworks().filter(h => h.status !== 'done').length;
  const lowPkg = gPackages().filter(p => p.status !== 'done' && p.stats.remain <= S.data.settings.reminders.packageLowHours).length;
  const nc = nextCourse();
  const nt = nc ? `${toMin(nc._t.start) - toMin(nowHM())}<small style="font-size:10px">分</small>` : '—';

  $('#tbStats').innerHTML = `
    <div class="tb-stat" onclick="go('today')"><b>${cs.length}</b><span>作业</span></div>
    <div class="tb-stat" onclick="go('today')"><b>${todo}</b><span>待办作业</span></div>
    <div class="tb-stat" onclick="go('today')"><b>${nt}</b><span>距下节课</span></div>
    <div class="tb-stat" onclick="go('package')"><b>${lowPkg || gPackages().filter(p => p.status !== 'done').length}</b><span>${lowPkg ? '课包告急' : '在读课包'}</span></div>`;
}

function renderVersion() {
  const html = `<b>${esc(S.data.family.name || '我们家')} · 星光伴学屋</b><br>
    <span>v${S.meta.version} · build ${S.meta.build}</span>`;
  ['#ver1', '#ver2', '#ver3', '#ver4', '#ver5'].forEach(s => { const e = $(s); if (e) e.innerHTML = html; });
}

function updateBadge() {
  const n = gHomeworks().filter(h => h.status !== 'done').length;
  const b = $('#navBadge');
  b.style.display = n ? 'grid' : 'none';
  b.textContent = n > 99 ? '99+' : n;
}

/* ---------- 提醒 ---------- */
function notify(key, title, body) {
  if (S.notified.has(key)) return;
  S.notified.add(key);
  sessionStorage.setItem('sm_notified', JSON.stringify([...S.notified]));
  toast('🔔 ' + title, 4000);
  const r = S.data.settings.reminders;
  if (r.browserPush && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, tag: key, icon: '/icon.png', badge: '/icon.png' });
    } catch (_) { }
  }
}

function checkReminders() {
  if (!S.data) return;
  const r = S.data.settings.reminders;
  const now = toMin(nowHM());
  const t = today();

  if (r.enableClass) {
    todayCourses().forEach(c => {
      const diff = toMin(c._t.start) - now;
      if (diff > 0 && diff <= (r.classBefore || 30)) {
        notify(`class_${t}_${c.id}`, `${diff}分钟后上课：${courseTitle(c)}`,
          `${c._t.start}-${c._t.end}${c.location ? ' · ' + c.location : ''}${c.teacher ? ' · ' + c.teacher + '老师' : ''}`);
      }
    });
  }

  if (r.enableHomework) {
    gHomeworks().filter(h => h.status !== 'done' && h.dueDate === t).forEach(h => {
      const diff = toMin(h.dueTime || '21:00') - now;
      if (diff > 0 && diff <= (r.homeworkBefore || 60)) {
        notify(`hw_${t}_${h.id}`, `作业还没打卡：${h.title}`, `${h.subject} · ${diff}分钟后到截止时间`);
      }
    });
  }

  if (r.enablePackage) {
    gPackages().filter(p => p.status !== 'done' && p.stats.remain <= (r.packageLowHours || 6)).forEach(p => {
      notify(`pkg_${t}_${p.id}`, `课包余额不足：${p.name}`, `仅剩 ${p.stats.remain} 课时，记得提前安排续费`);
    });
  }

  if (r.enableExam) {
    gExams().filter(e => e.score == null && e.date >= t).forEach(e => {
      const d = relDays(e.date);
      if (d >= 0 && d <= (r.examBefore || 1)) {
        notify(`exam_${t}_${e.id}`, `${d === 0 ? '今天' : d + '天后'}考试：${e.subject} ${e.type || ''}`, e.name || '记得复习哦');
      }
    });
  }
}

/* ---------- 登录 ---------- */
async function tryEnter(code) {
  const btn = $('#loginBtn');
  btn.disabled = true; btn.textContent = '验证中…';
  try {
    const res = await fetch(apiURL('/api/login'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code })
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || '访问码不正确');
    S.token = code;
    localStorage.setItem('sm_token', code);
    await loadState();
    showWhoSelect();
  } catch (e) {
    toast(e.message);
    $('#codeInput').value = '';
  } finally {
    btn.disabled = false; btn.textContent = '进 入';
  }
}

async function enterApp() {
  $('#login').style.display = 'none';
  $('#whoSelect').style.display = 'none';
  $('#app').style.display = 'flex';
  $('#nav').style.display = 'flex';
  await refresh();
  go(gCourses().length ? 'today' : 'timetable');
  checkReminders();
  connectRealtime();   // 进入应用后建立实时同步（已配置 Worker 时生效，否则自动降级）
}

/* ---------- 选择身份 ---------- */
function showWhoSelect() {
  if (!S.data || !S.data.members.length) { enterApp(); return; }
  const cur = S.who;
  $('#whoList').innerHTML = S.data.members.map(m => {
    const o = roleInfo(m.role);
    return `<div class="who-i ${m.name === cur ? 'who-cur' : ''}" onclick="pickWho('${esc(m.id)}')">
      <div class="who-ava">${esc(m.avatar || '👤')}</div>
      <div class="col"><b>${esc(m.name)}</b><span class="muted">${esc(roleLabel(m.role))}</span></div>
      <span class="who-tag tag ${o.cls}">${o.tier}</span>
    </div>`;
  }).join('');
  $('#login').style.display = 'none';
  $('#app').style.display = 'none';
  $('#nav').style.display = 'none';
  $('#whoSelect').style.display = 'flex';
}
function pickWho(id) {
  const m = S.data.members.find(x => x.id === id);
  if (!m) return;
  S.who = m.name;
  localStorage.setItem('sm_who', m.name);
  syncRole();
  enterApp();
}
function whoBackToLogin() {
  disconnectRealtime();
  localStorage.removeItem('sm_token');
  localStorage.removeItem('sm_who');
  localStorage.removeItem('sm_role');
  S.token = ''; S.who = ''; S.role = '';
  $('#whoSelect').style.display = 'none';
  $('#app').style.display = 'none';
  $('#nav').style.display = 'none';
  $('#login').style.display = 'flex';
  $('#codeInput').value = '';
  setTimeout(() => $('#codeInput').focus(), 300);
}

/* ---------- 角色 UI（按当前身份控制编辑入口的可见性） ---------- */
function applyRoleUI() {
  if (!S.data) return;
  // FAB：按所在页面与角色决定
  const fabScope = { timetable: 'course', today: 'homework', package: 'package', exam: 'exam', me: null };
  const sc = fabScope[S.page];
  $('#fab').style.display = (S.page === 'me' || !sc || !canEdit(sc)) ? 'none' : 'grid';
  // 课表工具（批量录入 / 作息时间）：管理员可见
  const showTools = canEdit('course');
  $('#ttToolsSec').style.display = showTools ? '' : 'none';
  $('#ttToolsCard').style.display = showTools ? '' : 'none';
  // 顶部「切换年级 / 提醒」：所有角色均可使用（仅切换视图，不改数据）
}

/* ---------- 启动 ---------- */
(async function boot() {
  // 事件绑定
  $('#nav').addEventListener('click', e => {
    const b = e.target.closest('button[data-p]');
    if (b) go(b.dataset.p);
  });
  $('#mask').addEventListener('click', e => { if (e.target.id === 'mask') closeSheet(); });
  $('#sheetClose').onclick = closeSheet;
  $('#loginBtn').onclick = () => tryEnter($('#codeInput').value.trim());
  $('#codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') tryEnter(e.target.value.trim()); });
  $('#gradeBtn').onclick = () => gradeSwitcher();
  $('#bellBtn').onclick = () => { go('me'); setTimeout(() => window.scrollTo({ top: 700, behavior: 'smooth' }), 260); };
  $('#batchBtn').onclick = () => batchForm();
  $('#periodBtn').onclick = () => periodForm();

  $('#ttSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#ttSeg button').forEach(x => x.classList.toggle('on', x === b));
    S.ttView = b.dataset.v; renderTimetable();
  });
  $('#ttWeekSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#ttWeekSeg button').forEach(x => x.classList.toggle('on', x === b));
    S.ttWeek = b.dataset.v; renderTimetable();
  });

  $('#fab').onclick = () => {
    if (S.page === 'timetable') courseForm();
    else if (S.page === 'today') hwForm();
    else if (S.page === 'package') pkgForm();
    else if (S.page === 'exam') examForm();
  };

  // 定时提醒 + 每分钟刷新倒计时
  setInterval(() => {
    checkReminders();
    if (S.data && (S.page === 'today' || S.page === 'timetable')) renderTop();
  }, 30000);

  // 回到前台时同步最新数据（家人可能改过）
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && S.token && S.data) refresh().catch(() => { });
  });

  // 尝试自动进入
  try {
    const meta = await (await fetch(apiURL('/api/meta'))).json();
    document.title = (meta.childName || '宝贝') + ' 的星光伴学屋';
    $('#loginTitle').textContent = (meta.childName || '宝贝') + ' 的星光伴学屋';
    if (S.token) {
      const res = await fetch(apiURL('/api/state'), { headers: { 'X-Access-Code': S.token } });
      if (res.ok) { await loadState(); return showWhoSelect(); }
    }
  } catch (_) { }
  $('#login').style.display = 'flex';
  setTimeout(() => $('#codeInput').focus(), 300);
})();
