/* ================= 课外辅导课包（课次制） ================= */

// 课次六种状态
const SESSION = {
  sc: { t: '待上课', c: 'gy', e: '⏳' },
  at: { t: '已上课', c: 'g', e: '✅' },
  lv: { t: '已请假', c: 'o', e: '🙋' },
  mk: { t: '补课', c: 'p', e: '🔁' },
  no: { t: '已取消', c: 'gy', e: '✕' }
};
const LEAVE_RULE = { keep: '请假不扣课时（可补课）', deduct: '请假即扣课时' };
const sessPill = (s) => {
  if (s.rescheduled && s.status === 'sc') return `<span class="tag p">↪ 已调课${s.origDate ? ' 原' + fmtDate(s.origDate) : ''}</span>`;
  const m = SESSION[s.status] || SESSION.sc;
  return `<span class="tag ${m.c}">${m.e} ${m.t}</span>`;
};

function renderPackages() {
  const box = document.getElementById('pkgBody');
  const all = gPackages();
  const active = all.filter(p => p.status !== 'done');
  const done = all.filter(p => p.status === 'done');
  const low = S.data.settings.reminders.packageLowHours;

  if (!all.length) {
    box.innerHTML = `<div class="card"><div class="empty"><span class="em">🎒</span>
      <p>还没有课外辅导课包<br>${canEdit('package') ? '把在上的辅导班登记进来，<br>系统帮你盯着还剩几次课、什么时候该续费' : '请联系管理员登记课包'}</p>
      ${canEdit('package') ? `<button class="btn fu" style="margin-top:14px" onclick="pkgForm()">添加课包</button>` : ''}</div></div>`;
    return;
  }

  const totalPay = all.reduce((s, p) => s + (Number(p.price) || 0), 0);
  const totalRemain = active.reduce((s, p) => s + p.stats.remain, 0);
  const remainValue = active.reduce((s, p) => s + p.stats.remain * (Number(p.unitPrice) || (p.price && p.totalHours ? p.price / p.totalHours : 0)), 0);

  let h = `<div class="stat3">
    <div><b style="color:var(--fu)">${active.length}</b><span>在读课包</span></div>
    <div><b style="color:var(--main)">${totalRemain}</b><span>剩余课时</span></div>
    <div><b style="color:var(--ok)">¥${Math.round(remainValue)}</b><span>剩余价值</span></div>
  </div>`;

  h += `<div class="sec-h"><div class="sec-t">🎯 在读课包 <small>累计投入 ¥${totalPay}</small></div>
    ${canEdit('package') ? `<button class="btn xs fu" onclick="pkgForm()">+ 新增</button>` : ''}</div>`;

  h += active.map(p => {
    const st = p.stats;
    const termTag = pkgTermLabel(p);
    const warn = st.remain <= low;
    const expSoon = p.endDate && relDays(p.endDate) <= 30 && relDays(p.endDate) >= 0;
    const expired = p.endDate && relDays(p.endDate) < 0;
    const color = warn ? 'var(--warn)' : st.percent > 60 ? 'var(--yan)' : 'var(--fu)';
    const schedTx = (p.schedule || []).map(s => WD_S[Number(s.weekday)] + s.start).join('、');
    const nextS = (p.sessions || []).filter(s => s.status === 'sc').sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))[0];
    return `<div class="card" onclick="pkgDetail('${p.id}')">
      <div class="pkg-hd">
        <div class="pkg-ic" style="background:${warn ? 'rgba(255,107,107,.12)' : 'rgba(165,94,234,.12)'}">${emojiOf(p.subject)}</div>
        <div class="col grow"><b class="ell" style="font-size:15px">${esc(p.name)}</b>
          <span class="muted ell">${esc(p.org || '未填机构')}${p.teacher ? ' · ' + esc(p.teacher) + '老师' : ''}${p.teacherContact ? ' · ' + esc(p.teacherContact) : ''}</span></div>
        ${termTag ? `<span class="tag yan">${esc(termTag)}</span>` : ''}${warn ? '<span class="tag r">余额不足</span>' : expired ? '<span class="tag gy">已过期</span>' : expSoon ? '<span class="tag o">即将到期</span>' : '<span class="tag p">在读</span>'}
      </div>
      <div class="bar"><i style="width:${Math.min(100, st.percent)}%;background:${color}"></i></div>
      <div class="pkg-num">
        <div><b class="${warn ? 'warn' : 'ok'}">${st.remain}</b>剩余课时</div>
        <div><b>${st.consumed}/${st.total}</b>已上课时</div>
        ${p.unitPrice ? `<div><b>¥${p.unitPrice}</b>单价</div>` : ''}
        ${st.scheduled ? `<div><b>${st.scheduled}</b>待上课次</div>` : ''}
      </div>
      ${schedTx ? `<p class="muted" style="margin-top:7px">📅 每周固定：${schedTx}</p>` : ''}
      ${nextS ? `<p class="muted">下一节：${fmtDateFull(nextS.plannedDate)} ${WD[Number(nextS.weekday)]} ${nextS.start}</p>` : ''}
      ${warn ? `<p style="font-size:11.5px;color:var(--warn);margin-top:6px;font-weight:600">⚠️ 剩余不足 ${low} 课时，记得提前决定是否续费</p>` : ''}
      ${p.endDate ? `<p class="muted" style="margin-top:4px">有效期至 ${fmtDateFull(p.endDate)}${expSoon ? `（还剩${relDays(p.endDate)}天）` : ''}</p>` : ''}
    </div>`;
  }).join('');

  if (done.length) {
    h += `<div class="sec-h"><div class="sec-t">📦 已结课 <small>${done.length} 个</small></div></div>`;
    h += done.map(p => `<div class="card flat" onclick="pkgDetail('${p.id}')">
      <div class="row"><div class="col grow"><b class="ell" style="font-size:14px">${emojiOf(p.subject)} ${esc(p.name)}</b>
        <span class="muted">${p.stats.consumed}/${p.stats.total} 课时 · ${esc(p.org || '')}</span></div>
      <span class="tag gy">已结课</span></div></div>`).join('');
  }

  box.innerHTML = h;
}

/* ---------- 课包详情 ---------- */
function pkgDetail(id) {
  const p = S.data.packages.find(x => x.id === id);
  if (!p) return;
  // 仅在切换到不同课包时重置月份展开状态；同一课包内的操作（标记上课等）保留用户已展开的/收起的月份
  if (__openPkg !== p.id) { __openMonth = undefined; __openPkg = p.id; }
  const st = p.stats || { remain: 0, total: 0, consumed: 0, percent: 0, attended: 0, leave: 0, makeup: 0, scheduled: 0, cancelled: 0 };
  const curYM = today().slice(0, 7);
  const termTag = pkgTermLabel(p);
  const sessions = (p.sessions || []).slice().sort((a, b) => {
    const am = a.plannedDate.slice(0, 7) === curYM ? 0 : 1;
    const bm = b.plannedDate.slice(0, 7) === curYM ? 0 : 1;
    return am - bm || a.plannedDate.localeCompare(b.plannedDate);
  });
  const schedTx = (p.schedule || []).map(s => WD_S[Number(s.weekday)] + ' ' + s.start + '-' + s.end).join('、');
  const linked = gCourses().filter(c => c.packageId === p.id);
  const target = Math.ceil((Number(p.totalHours) || 0) / (Number(p.hoursEach) || 1));
  const needGen = sessions.length < target && (p.schedule || []).length;

  const body = `
    <div class="card" style="margin-bottom:12px">
      <div class="pkg-hd">
        <div class="pkg-ic">${emojiOf(p.subject)}</div>
        <div class="col grow"><b style="font-size:16px">${esc(p.name)}</b>${termTag ? ` <span class="tag yan">${esc(termTag)}</span>` : ''}
        <span class="muted">${esc(p.org || '')}${p.teacher ? ' · ' + esc(p.teacher) + '老师' : ''}${p.teacherContact ? ' · ' + esc(p.teacherContact) : ''}</span></div>
      </div>
      <div class="bar"><i style="width:${Math.min(100, st.percent)}%;background:var(--fu)"></i></div>
      <div class="pkg-num">
        <div><b class="${st.remain <= S.data.settings.reminders.packageLowHours ? 'warn' : 'ok'}">${st.remain}</b>剩余</div>
        <div><b>${st.consumed}</b>已消</div>
        <div><b>${st.total}</b>总课时</div>
        ${st.attended ? `<div><b>${st.attended}</b>已上</div>` : ''}
        ${st.leave ? `<div><b>${st.leave}</b>请假</div>` : ''}
        ${st.makeup ? `<div><b>${st.makeup}</b>补课</div>` : ''}
      </div>
      <div class="muted" style="margin-top:8px">
        ${p.startDate ? '开课 ' + fmtDateFull(p.startDate) : ''}${p.endDate ? ' · 有效期至 ' + fmtDateFull(p.endDate) : ''}
      </div>
      ${schedTx ? `<p class="muted" style="margin-top:6px">📅 每周固定上课：${schedTx}（每次 ${p.hoursEach || 1} 课时）</p>` : ''}
      ${p.leaveRule ? `<p class="muted">🙋 请假规则：${LEAVE_RULE[p.leaveRule] || p.leaveRule}</p>` : ''}
      ${linked.length ? `<p class="muted">🗓 已关联课表：${linked.map(c => WD_S[Number(c.weekday)] + courseTime(c).start).join('、')}</p>` : ''}
      ${p.note ? `<p class="tx2" style="margin-top:7px">${esc(p.note)}</p>` : ''}
    </div>

    <div class="f2" style="margin-bottom:12px">
      ${canEdit('package') ? `<button class="btn fu" onclick="genSessions('${p.id}')">🗓 生成/补充课次</button>
      <button class="btn ghost" onclick="addSessionForm('${p.id}')">＋ 手动添加课次</button>
      ${p.status !== 'done' ? `<button class="btn ghost" onclick="rescheduleFuture('${p.id}')">↻ 重排未来课次</button>` : ''}` : ''}
    </div>
    ${needGen && canEdit('package') ? `<p class="muted" style="margin:-6px 0 12px">还有 ${target - sessions.length} 节课次未排，点「生成/补充课次」自动按固定时间排出。</p>` : ''}

    <div class="f2" style="margin-bottom:12px">
      ${canEdit('package') ? `<button class="btn ghost" onclick="pkgForm('${p.id}')">✏️ 编辑</button>
      ${p.status === 'done' ? `<button class="btn ok" onclick="setPkgStatus('${p.id}','active')">恢复在读</button>`
        : `<button class="btn ghost" onclick="setPkgStatus('${p.id}','done')">结课归档</button>`}
      <button class="btn warn" onclick="delPkg('${p.id}')">🗑 删除</button>` : ''}
    </div>

    <div class="sec-h" style="margin-top:0"><div class="sec-t">📋 全部课次 <small>${sessions.length} 节 · 待上 ${st.scheduled} / 已上 ${st.attended} / 请假 ${st.leave} / 补课 ${st.makeup}</small></div></div>
    <div id="sessListWrap"></div>
  `;
  openSheet('课包详情', body, '', () => renderSessMonths(p));
}

/* ---------- 全部课次：按月折叠（当月默认展开，其余折叠，单开手风琴） ---------- */
// __openMonth: undefined=未初始化(渲染时默认展开当月) / null=用户主动全部收起 / 'YYYY-MM'=当前展开的月份
let __openMonth = undefined;
let __openPkg = null;
function renderSessMonths(p) {
  const wrap = document.getElementById('sessListWrap');
  if (!wrap || !p) return;
  const curYM = today().slice(0, 7);
  const groups = {};
  (p.sessions || []).forEach(s => { const ym = s.plannedDate.slice(0, 7); (groups[ym] = groups[ym] || []).push(s); });
  const yms = Object.keys(groups).sort();
  if (!yms.length) { wrap.innerHTML = `<div class="card flat center"><span class="muted">还没有课次，点上方「生成/补充课次」</span></div>`; return; }
  // 未初始化 → 默认展开当月；已展开但当月已无课次(如数据变化)→ 回退到当月或最后一月；用户主动收起(null)则保持全收
  if (__openMonth === undefined || (__openMonth && !groups[__openMonth])) __openMonth = groups[curYM] ? curYM : yms[yms.length - 1];
  wrap.innerHTML = yms.map(ym => {
    const open = ym === __openMonth;
    const [y, m] = ym.split('-');
    const list = groups[ym].slice().sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
    const attended = list.filter(s => s.status === 'at').length;
    const rows = list.map((s, i) => {
      const past = s.plannedDate < today();
      return `<div class="list-i sess-row" style="${i === list.length - 1 ? 'border-bottom:none' : ''}" onclick="sessionActions('${p.id}','${s.id}')">
        <div class="list-ic">${(SESSION[s.status] || SESSION.sc).e}</div>
        <div class="col grow"><b style="font-size:13.5px">${fmtDateFull(s.plannedDate)} <span class="muted" style="font-weight:500">${WD[Number(s.weekday)]} ${s.start || ''}-${s.end || ''}</span>${s.rescheduled && s.origDate ? ` <span class="muted">原 ${fmtDate(s.origDate)}</span>` : ''}</b>
        ${s.note ? `<span class="muted ell">${esc(s.note)}</span>` : `<span class="muted">${past && s.status === 'sc' ? '已过期未处理' : (s.status === 'sc' ? '待上课' : '')}</span>`}
        </div>
        <div class="col" style="align-items:flex-end;gap:4px">
          ${sessPill(s)}
          <span class="muted">${s.hours || p.hoursEach || 1}课时</span>
        </div></div>`;
    }).join('');
    return `<div class="mo" style="margin-bottom:10px">
      <div class="mo-hd" onclick="toggleMonth('${p.id}','${ym}')">
        <b>${y}年${Number(m)}月</b>
        <span class="muted">${list.length} 节${attended ? ' · 已上' + attended : ''}${ym === curYM ? ' · 本月' : ''}</span>
        <span class="mo-ar">${open ? '▾' : '▸'}</span>
      </div>
      ${open ? `<div class="card" style="margin-top:8px">${rows}</div>` : ''}
    </div>`;
  }).join('');
}
function toggleMonth(pkgId, ym) {
  __openMonth = (__openMonth === ym) ? null : ym; // 单开手风琴：点已展开的折叠，点其他展开并收起其余
  const p = S.data.packages.find(x => x.id === pkgId);
  renderSessMonths(p);
}

/* ---------- 单节课次操作 ---------- */
function sessionActions(pkgId, sid) {
  const p = S.data.packages.find(x => x.id === pkgId);
  const s = (p.sessions || []).find(x => x.id === sid);
  if (!p || !s) return;
  const m = SESSION[s.status] || SESSION.sc;
  const lv = s.status === 'lv';
  const sc = s.status === 'sc';
  const at = s.status === 'at';
  const mk = s.status === 'mk';

  const body = `
    <div class="card" style="margin-bottom:12px">
      <div class="pkg-hd">
        <div class="pkg-ic">${m.e}</div>
        <div class="col grow"><b style="font-size:15px">${fmtDate(s.plannedDate)} ${WD[Number(s.weekday)]}</b>
        <span class="muted">${s.start || ''}-${s.end || ''} · ${s.hours || p.hoursEach || 1} 课时</span></div>
        ${sessPill(s)}
      </div>
      ${s.note ? `<p class="tx2" style="margin-top:8px">${esc(s.note)}</p>` : ''}
      ${s.rescheduled && s.origDate ? `<p class="muted" style="margin-top:6px">↪ 已从 <b>${fmtDate(s.origDate)} ${WD[new Date(s.origDate + 'T00:00:00').getDay()]}</b> 调至 <b>${fmtDate(s.plannedDate)} ${WD[Number(s.weekday)]}</b></p>` : (s.rescheduled ? `<p class="muted" style="margin-top:6px">↪ 该课次已调课</p>` : '')}
      ${lv && s.makeupOf ? `<p class="muted" style="margin-top:6px">已安排补课</p>` : ''}
    </div>
    <div class="sec-h"><div class="sec-t">操作</div></div>
    ${canEdit('package') ? `<div class="card" style="display:flex;flex-direction:column;gap:9px">
      ${sc ? `<button class="btn ok" onclick="sessAction('${pkgId}','${sid}','attend',{note:'已上课'})">✅ 标记已上课（扣 ${s.hours || p.hoursEach || 1} 课时）</button>` : ''}
      ${sc ? `<button class="btn yan" onclick="sessAction('${pkgId}','${sid}','leave',{note:'请假'})">🙋 请假</button>` : ''}
      ${sc ? `<button class="btn fu" onclick="rescheduleForm('${pkgId}','${sid}')">↪ 调课</button>` : ''}
      ${sc ? `<button class="btn ghost" onclick="sessAction('${pkgId}','${sid}','cancel')">✕ 取消这节课</button>` : ''}
      ${lv ? `<button class="btn fu" onclick="makeupForm('${pkgId}','${sid}')">🔁 安排补课</button>` : ''}
      ${lv ? `<button class="btn yan" onclick="sessAction('${pkgId}','${sid}','postpone')">⏩ 一键顺延补课</button>` : ''}
      ${(at || lv || mk || s.status === 'no') ? `<button class="btn ghost" onclick="sessAction('${pkgId}','${sid}','undo')">↩ 改回待上课</button>` : ''}
      <button class="btn warn ghost" style="align-self:flex-start" onclick="delSession('${pkgId}','${sid}')">🗑 删除该课次</button>
    </div>`
    : `<div class="card center"><span class="muted">当前身份仅可查看，课次管理请联系管理员</span></div>`}`;
  const foot = `<button class="btn ghost" onclick="pkgDetail('${pkgId}')">返回课包</button>`;
  openSheet('课次详情', body, foot);
}

async function sessAction(pkgId, sid, action, extra = {}) {
  if (!needRole('package')) return;
  const map = { attend: '已记录上课', leave: '已请假', cancel: '已取消', undo: '已改回待上课', postpone: '已安排顺延补课', makeup: '已安排补课', reschedule: '已调课' };
  try {
    await api(`/packages/${pkgId}/sessions/${sid}/action`, { method: 'POST', body: { action, ...extra } });
    await refresh();
    const np = S.data.packages.find(x => x.id === pkgId);
    pkgDetail(pkgId);
    toast(map[action] || '已更新');
  } catch (e) { toast(e.message); }
}

function rescheduleForm(pkgId, sid) {
  if (!needRole('package')) return;
  const p = S.data.packages.find(x => x.id === pkgId);
  const s = (p.sessions || []).find(x => x.id === sid);
  const d = Object.assign({ date: s.plannedDate, start: s.start, end: s.end }, s);
  openSheet('调课',
    `<p class="muted" style="margin-bottom:8px">原定上课：<b>${fmtDate(s.plannedDate)} ${WD[Number(s.weekday)]} ${s.start || ''}-${s.end || ''}</b>${s.origDate && s.origDate !== s.plannedDate ? `<br>最初排定：${fmtDate(s.origDate)}` : ''}</p>
     ${fInput('rsDate', '改到日期', d.date, '', 'date', true)}
     <div class="f2">${fInput('rsStart', '开始时间', d.start, '', 'time')}${fInput('rsEnd', '结束时间', d.end, '', 'time')}</div>
     <p class="muted">💡 调课后课表会自动更新到新时间，原日期会保留可查看</p>`,
    `<button class="btn ghost" onclick="sessionActions('${pkgId}','${sid}')">返回</button><button class="btn fu" id="rsSave">确定调课</button>`,
    () => {
      document.getElementById('rsSave').onclick = async () => {
        if (!val('rsDate')) return toast('请选择日期');
        try {
          await api(`/packages/${pkgId}/sessions/${sid}/action`, { method: 'POST', body: { action: 'reschedule', date: val('rsDate'), start: val('rsStart'), end: val('rsEnd') } });
          await refresh(); pkgDetail(pkgId); toast('已调课 ↪');
        } catch (e) { toast(e.message); }
      };
    });
}

function makeupForm(pkgId, sid) {
  if (!needRole('package')) return;
  const p = S.data.packages.find(x => x.id === pkgId);
  const s = (p.sessions || []).find(x => x.id === sid);
  // 客户端估算一个顺延日期作为默认
  const occ = new Set((p.sessions || []).map(x => x.plannedDate));
  let dd = new Date(s.plannedDate + 'T00:00:00');
  const sched = p.schedule || [];
  let def = s.plannedDate, g = 0;
  while (g++ < 400) { dd.setDate(dd.getDate() + 1); const wd = dd.getDay(); if (sched.some(x => Number(x.weekday) === wd) && !occ.has(ymd(dd))) { def = ymd(dd); break; } }
  openSheet('安排补课',
    `${fInput('mkDate', '补课日期', def, '不填则自动顺延到下一个空档', 'date')}
     <div class="f2">${fInput('mkStart', '开始时间', s.start, '', 'time')}${fInput('mkEnd', '结束时间', s.end, '', 'time')}</div>
     <p class="muted">💡 补课会扣 ${s.hours || p.hoursEach || 1} 课时，并自动关联到这次请假</p>`,
    `<button class="btn ghost" onclick="sessionActions('${pkgId}','${sid}')">返回</button><button class="btn fu" id="mkSave">确定补课</button>`,
    () => {
      document.getElementById('mkSave').onclick = async () => {
        const date = val('mkDate');
        try {
          if (date) await api(`/packages/${pkgId}/sessions/${sid}/action`, { method: 'POST', body: { action: 'makeup', date, start: val('mkStart'), end: val('mkEnd') } });
          else await api(`/packages/${pkgId}/sessions/${sid}/action`, { method: 'POST', body: { action: 'postpone' } });
          await refresh(); pkgDetail(pkgId); toast('已安排补课 🔁');
        } catch (e) { toast(e.message); }
      };
    });
}

function addSessionForm(pkgId) {
  if (!needRole('package')) return;
  const p = S.data.packages.find(x => x.id === pkgId);
  const slot = (p.schedule || [])[0] || { weekday: 2, start: '18:30', end: '20:00' };
  openSheet('手动添加课次',
    `${fInput('asDate', '日期', today(), '', 'date', true)}
     <div class="f2">${fInput('asStart', '开始时间', slot.start, '', 'time')}${fInput('asEnd', '结束时间', slot.end, '', 'time')}</div>
     ${fPick('asStatus', '状态', [{ v: 'sc', t: '待上课' }, { v: 'at', t: '已上课（直接扣课时）' }, { v: 'lv', t: '请假' }, { v: 'no', t: '已取消' }], 'sc')}
     ${fArea('asNote', '备注', '', '选填')}`,
    `<button class="btn ghost" onclick="pkgDetail('${pkgId}')">返回</button><button class="btn fu" id="asSave">添加</button>`,
    () => {
      document.getElementById('asSave').onclick = async () => {
        if (!val('asDate')) return toast('请选择日期');
        try {
          await api(`/packages/${pkgId}/sessions`, { method: 'POST', body: { plannedDate: val('asDate'), start: val('asStart'), end: val('asEnd'), status: pickVal('#asStatus'), note: val('asNote') } });
          await refresh(); pkgDetail(pkgId); toast('已添加课次');
        } catch (e) { toast(e.message); }
      };
    });
}

async function genSessions(pkgId) {
  if (!needRole('package')) return;
  const p = S.data.packages.find(x => x.id === pkgId);
  if (!(p.schedule || []).length) return toast('请先在「编辑课包」里设置每周固定上课时间');
  try {
    const r = await api(`/packages/${pkgId}/generate`, { method: 'POST' });
    await refresh();
    pkgDetail(pkgId);
    toast(`已排好课次，共 ${r.data.sessions.length} 节`);
  } catch (e) { toast(e.message); }
}

// 重排未来待上课次到新周几（仅改未来、不动历史已上课）
async function rescheduleFuture(pkgId) {
  if (!needRole('package', '重排未来课次需要管理员权限')) return;
  const p = S.data.packages.find(x => x.id === pkgId);
  if (!(p.schedule || []).length) return toast('请先在「编辑课包」里设置每周固定上课时间');
  confirmBox('重排未来课次',
    '把还没上的课次（待上课）按当前「每周固定上课时间」重新排到对应的星期，已上课的历史课次不动。确定吗？',
    async () => {
      try {
        const r = await api(`/packages/${pkgId}/reschedule-future`, { method: 'POST' });
        await refresh(); pkgDetail(pkgId);
        toast(r.moved ? `已重排 ${r.moved} 节未来课次 ✅` : '没有需要重排的未来课次');
      } catch (e) { toast(e.message); }
    });
}

async function delSession(pkgId, sid) {
  if (!needRole('package', '删除课次需要管理员权限')) return;
  confirmBox('删除课次', '确定删除这节课次吗？删除后对应的请假/补课关联也会一并移除。', async () => {
    try { await api(`/packages/${pkgId}/sessions/${sid}`, { method: 'DELETE' }); await refresh(); pkgDetail(pkgId); toast('已删除'); }
    catch (e) { toast(e.message); }
  });
}

async function quickConsume(pkgId) {
  if (!needRole('package')) return;
  const p = S.data.packages.find(x => x.id === pkgId);
  if (!p) return;
  // 优先标记今天的待上课次
  const todayS = (p.sessions || []).find(s => s.status === 'sc' && s.plannedDate === today());
  try {
    if (todayS) {
      await api(`/packages/${pkgId}/sessions/${todayS.id}/action`, { method: 'POST', body: { action: 'attend', note: '课表一键扣课时' } });
    } else {
      // 没有今天的课次则临时建一条“已上课”记录
      const course = gCourses().find(c => c.packageId === pkgId);
      const wd = course ? Number(course.weekday) : new Date().getDay();
      await api(`/packages/${pkgId}/sessions`, { method: 'POST', body: { plannedDate: today(), weekday: wd, start: course ? courseTime(course).start : '18:30', end: course ? courseTime(course).end : '20:00', status: 'at', note: '课表一键扣课时' } });
    }
    await refresh();
    const np = S.data.packages.find(x => x.id === pkgId);
    toast(`已扣 ${np.hoursEach || 1} 课时，还剩 ${np.stats.remain} 次`);
  } catch (e) { toast(e.message); }
}

/* ---------- 课包表单（含每周固定时间） ---------- */
function schedEditor(p) {
  const sch = (p && p.schedule && p.schedule.length) ? p.schedule : [{ weekday: 2, start: '18:30' }];
  return `<div id="pfSched">${sch.map(schedRow).join('')}</div>
    <button class="btn ghost xs" style="margin-top:6px" onclick="addSchedRow()">＋ 再加一个上课日</button>
    <p class="muted" style="margin-top:6px">每周固定「星期 + 开始时间」即可，结束时间按上方「上课时长」自动推算，保存后依「总课时」排出每一节课次</p>`;
}
/** 依据「开始时间 + 上课时长」重算某一行的结束时间（显示在禁用的结束输入框中） */
function recalcSchedEnd(row) {
  if (!row) return;
  const dur = (document.getElementById('pfDur') && numVal('pfDur', 0)) || (typeof __pkgDurMin !== 'undefined' ? __pkgDurMin : 90) || 90;
  const els = row.querySelectorAll('select,input');
  const start = els[1].value;
  const endEl = els[2];
  if (endEl) endEl.value = minToHM(toMin(start) + dur);
}
function recalcAllSchedEnds() {
  document.querySelectorAll('#pfSched [data-sched]').forEach(recalcSchedEnd);
}
function schedRow(s) {
  const days = [1, 2, 3, 4, 5, 6, 0].map(x => `<option value="${x}"${Number(s.weekday) === x ? ' selected' : ''}>${WD_S[x]}</option>`).join('');
  const dur = (document.getElementById('pfDur') && numVal('pfDur', 0)) || (typeof __pkgDurMin !== 'undefined' ? __pkgDurMin : 90) || 90;
  const end = minToHM(toMin(s.start || '18:30') + dur);
  return `<div class="f2" style="margin-bottom:6px;align-items:center" data-sched>
    <select style="flex:.62">${days}</select>
    <input type="time" value="${s.start || '18:30'}" style="flex:.95" placeholder="开始" oninput="recalcSchedEnd(this.closest('[data-sched]'))">
    <input type="time" value="${end}" style="flex:.95" placeholder="结束" disabled title="根据「上课时长(分钟)」自动推算" tabindex="-1">
    <button type="button" class="btn xs ghost" onclick="this.closest('[data-sched]').remove();recalcAllSchedEnds()">✕</button></div>`;
}
function addSchedRow() { document.getElementById('pfSched').insertAdjacentHTML('beforeend', schedRow({ weekday: 2, start: '18:30' })); recalcAllSchedEnds(); document.getElementById('pfSched').dispatchEvent(new Event('input')); }
/** 读取每周固定时间：只存星期+开始，结束时间按「开始 + 上课时长」自动推算 */
function readSched() {
  const durEl = document.getElementById('pfDur');
  const dur = (durEl && numVal('pfDur', 0)) || (typeof __pkgDurMin !== 'undefined' ? __pkgDurMin : 90) || 90;
  return Array.from(document.querySelectorAll('#pfSched [data-sched]')).map(r => {
    const els = r.querySelectorAll('select,input');
    const start = els[1].value;
    return { weekday: Number(els[0].value), start, end: minToHM(toMin(start) + dur) };
  }).filter(s => s.weekday != null && s.start);
}

/** 客户端依据「总课时 + 每次课时数 + 开课日 + 每周固定安排」推算预计结课日 */
function projectEndDateUI() {
  const sched = readSched();
  const total = numVal('pfTotal', 0);
  const he = numVal('pfHours', 1) || 1;
  const start = val('pfStart');
  if (!sched.length || !total || !start) return null;
  const target = Math.ceil(total / he);
  const d = new Date(start + 'T00:00:00');
  let made = 0, guard = 0, last = null;
  while (made < target && guard++ < 3000) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (sched.some(s => Number(s.weekday) === wd)) { made++; last = ymd(d); }
  }
  return last;
}
function updateEndHint() {
  const el = document.getElementById('pfEndHint');
  if (!el) return;
  const last = projectEndDateUI();
  if (last) {
    const tot = numVal('pfTotal', 0), he = numVal('pfHours', 1) || 1, tgt = Math.ceil(tot / he);
    el.innerHTML = `📅 预计结课：<b>${last}</b>（约 ${tgt} 节课，按开课日与每周安排推算）`;
  } else {
    el.textContent = '';
  }
}
/** 自动推算有效期：仅填入「有效期至」并刷新预计结课提示，不关闭编辑页，由用户确认后点保存 */
async function autoEndDate(id) {
  const last = projectEndDateUI();
  if (!last) return toast('请先填好总课时、开课日和上课安排');
  const endInput = document.getElementById('pfEnd');
  if (endInput) endInput.value = last;
  updateEndHint();
  toast('已填入预计结课日，确认后点「保存」');
}

function pkgForm(id) {
  if (!needRole('package')) return;
  const p = id ? S.data.packages.find(x => x.id === id) : null;
  const d = Object.assign({ subject: '奥数', totalHours: 32, hoursEach: 1, durationMin: 90, startDate: today(), leaveRule: 'keep', status: 'active' }, p || {});
  if (d.durationMin == null) {
    const s0 = (p && p.schedule && p.schedule[0]) || {};
    d.durationMin = (s0.end && s0.start) ? (toMin(s0.end) - toMin(s0.start)) : 90;
  }
  window.__pkgDurMin = d.durationMin || 90;
  const initTerm = d.term && TERM_PRESETS.some(o => o.v === d.term) ? d.term : (d.term ? 'custom' : 'all');
  const body = `
    ${fSelect('pfSubject', '科目', subjOptions(), d.subject, true)}
    ${fInput('pfName', '课包名称', d.name, '如：奥数思维春季班', 'text', true)}
    ${gradeHasTermDates()
      ? `<p class="muted">📌 学期/假期按「开课日期 ~ 有效期至」自动对应到${esc(curGrade().name)}的上下学期与寒暑假，无需手动选择</p>`
      : `<div id="pfTermWrap">${fPick('pfTerm', '学期/阶段', TERM_PRESETS, initTerm, 'sm')}
      <div id="pfTermCustomWrap" style="margin-top:8px;${initTerm === 'custom' ? '' : 'display:none'}">${fInput('pfTermCustom', '自定义阶段名称', initTerm === 'custom' ? d.term : '', '如：中考冲刺')}</div></div>`}
    <div class="f2">${fInput('pfOrg', '机构', d.org, '如：明智教育')}${fInput('pfTeacher', '老师', d.teacher, '选填')}</div>
    ${fInput('pfTeacherContact', '老师联系方式', d.teacherContact, '选填，如微信/电话')}
    ${fInput('pfTotal', '总课时', d.totalHours, '购买的总课时数', 'number', true)}
    <div class="f2">${fInput('pfHours', '每次课时数', d.hoursEach, '如 1 或 1.5', 'number', true)}${fInput('pfDur', '上课时长(分钟)', d.durationMin, '如 90', 'number', true)}</div>
    <div class="f"><label>每周固定上课时间 <em>*</em></label>${schedEditor(p)}</div>
    <div class="f2">${fInput('pfPrice', '课包总价（元）', d.price, '选填', 'number')}${fInput('pfUnit', '单价（元/课时）', d.unitPrice, '自动计算', 'number')}</div>
    <div class="f2">${fInput('pfStart', '开课日期', d.startDate, '', 'date')}${fInput('pfEnd', '有效期至', d.endDate, '', 'date')}</div>
    <button class="btn ghost xs" type="button" style="margin:0 0 8px" onclick="autoEndDate('${id || ''}')">📅 自动推算有效期</button>
    <p class="muted" id="pfEndHint"></p>
    ${fPick('pfLeaveRule', '请假规则', [{ v: 'keep', t: '请假不扣课时（可补课）' }, { v: 'deduct', t: '请假即扣课时' }], d.leaveRule)}
    ${fArea('pfNote', '备注', d.note, '选填，如：上课地址、班主任电话')}
    ${p ? '' : `<p class="muted">💡 保存后会自动按总课时排出每一节课次，上完课一键扣课时</p>`}`;
  openSheet(p ? '编辑课包' : '添加课包', body,
    `<button class="btn ghost" onclick="closeSheet()">取消</button><button class="btn fu" id="pfSave">保存</button>`,
    () => {
      const tot = document.getElementById('pfTotal'), pri = document.getElementById('pfPrice'), unit = document.getElementById('pfUnit');
      const calc = () => { const t = parseFloat(tot.value), q = parseFloat(pri.value); if (t > 0 && q > 0) unit.value = Math.round(q / t * 100) / 100; };
      tot.oninput = calc; pri.oninput = calc;
      const startEl = document.getElementById('pfStart'), hoursEl = document.getElementById('pfHours'), schedBox = document.getElementById('pfSched'), durEl = document.getElementById('pfDur');
      const liveEnd = () => { calc(); updateEndHint(); recalcAllSchedEnds(); };
      [tot, hoursEl, startEl, durEl].forEach(el => el && (el.oninput = liveEnd));
      if (schedBox) schedBox.addEventListener('input', updateEndHint);
      recalcAllSchedEnds();
      updateEndHint();
      // 学期/阶段：选「自定义」时显示名称输入框
      const te = document.getElementById('pfTerm');
      if (te) te.addEventListener('click', () => setTimeout(() => {
        const cw = document.getElementById('pfTermCustomWrap');
        if (cw) cw.style.display = pickVal('#pfTerm') === 'custom' ? '' : 'none';
      }, 0));
      document.getElementById('pfSave').onclick = async () => {
        if (!val('pfName')) return toast('请填写课包名称');
        const sched = readSched();
        if (!sched.length) return toast('请至少设置一个上课日');
        const hoursEach = numVal('pfHours', 1) || 1;
        const durationMin = numVal('pfDur', 90) || 90;
        const body = {
          gradeId: gid(), subject: val('pfSubject'), name: val('pfName'), org: val('pfOrg'), teacher: val('pfTeacher'), teacherContact: val('pfTeacherContact'),
          term: gradeHasTermDates() ? null : (pickVal('#pfTerm') === 'custom' ? (val('pfTermCustom') || '自定义') : pickVal('#pfTerm')),
          totalHours: numVal('pfTotal', 0), hoursEach, durationMin, price: numVal('pfPrice', 0) || null, unitPrice: numVal('pfUnit', 0) || null,
          startDate: val('pfStart'), endDate: val('pfEnd'), note: val('pfNote'), status: d.status || 'active',
          leaveRule: pickVal('#pfLeaveRule') || 'keep', schedule: sched, records: p ? undefined : []
        };
        try {
          let pkgId;
          if (p) {
            delete body.records;
            pkgId = id;
            await api('/packages/' + id, { method: 'PUT', body });
            await api(`/packages/${id}/generate`, { method: 'POST' });
          } else {
            const r = await api('/packages', { method: 'POST', body: { ...body, sessions: [] } });
            pkgId = r.data.id;
            await api(`/packages/${r.data.id}/generate`, { method: 'POST' });
          }
          // 同步关联课表课程的结束时间 = 开始时间 + 上课时长
          await Promise.all(S.data.courses.filter(c => c.packageId === pkgId && c.startTime).map(c =>
            api('/courses/' + c.id, { method: 'PUT', body: { endTime: minToHM(toMin(c.startTime) + durationMin) } })));
          await refresh(); closeSheet(); toast('已保存 🎉');
        } catch (e) { toast(e.message); }
      };
    });
}

async function setPkgStatus(id, status) {
  if (!needRole('package')) return;
  try { await api('/packages/' + id, { method: 'PUT', body: { status } }); await refresh(); pkgDetail(id); toast(status === 'done' ? '已归档' : '已恢复'); }
  catch (e) { toast(e.message); }
}
function delPkg(id) {
  if (!needRole('package', '删除课包需要管理员权限')) return;
  confirmBox('删除课包', '课包及其所有课次都会被删除，且无法恢复。确定吗？', async () => {
    try { await api('/packages/' + id, { method: 'DELETE' }); await refresh(); closeSheet(); toast('已删除'); }
    catch (e) { toast(e.message); }
  });
}
