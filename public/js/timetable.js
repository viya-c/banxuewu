/* ================= 课表模块 ================= */

function renderTimetable() {
  const box = document.getElementById('ttBody');
  const seg = termSegHTML();
  const list = gCourses();
  if (!list.length) {
    box.innerHTML = seg + `<div class="card"><div class="empty"><span class="em">📅</span>
      <p>还没有课程哦～<br>${canEdit('course') ? '点右下角 <b>＋</b> 添加，或用下方「批量录入」一次填好一周正课' : '请联系管理员添加课程'}</p>
      ${canEdit('course') ? `<button class="btn" style="margin-top:14px" onclick="courseForm()">添加第一门课</button>` : ''}</div></div>`;
    bindTermSeg();
    return;
  }
  const view = S.ttView === 'week' ? ttWeekHTML(list) : ttListHTML(list);
  box.innerHTML = seg + `<div class="tt-week" id="ttWeek">${weekBarHTML()}${view}</div>`;
  bindTermSeg();
  bindWeekNav();
}

function ttDays() {
  return S.data.settings.showWeekend ? [1, 2, 3, 4, 5, 6, 0] : [1, 2, 3, 4, 5];
}

/** 课表周导航条：显示「学期第 N 周 / 总周数」，左右箭头翻周，点中间回本周 */
function weekBarHTML() {
  const off = S.ttWeekOffset || 0;
  const vm = new Date(mondayOf(today()) + 'T00:00:00'); vm.setDate(vm.getDate() + off * 7);
  const info = termWeekOf(ymd(vm), curTerm());
  const termName = info.term ? info.term.name : '';
  let label;
  if (info.week < 1) label = (info.scope === 'term' ? termName + ' · ' : '') + '学期暂未开始';
  else label = (info.scope === 'term' ? termName + ' · ' : '') + `第 ${info.week} 周` + (info.total ? ` / ${info.total}` : '');
  const cur = off === 0;
  const sub = info.week < 1 ? '尚未开始' : (cur ? '本周 · 点此刷新' : (off < 0 ? '过去 · 点此回本周' : '未来 · 点此回本周'));
  return `<div class="tt-weekbar ${cur ? 'cur' : 'off'}">
    <button class="wb-arrow" onclick="shiftWeek(-1)" aria-label="上一周">‹</button>
    <div class="wb-mid" onclick="goTodayWeek()">
      <span class="wb-lab">${esc(label)}</span>
      <span class="wb-sub">${sub}</span>
    </div>
    <button class="wb-arrow" onclick="shiftWeek(1)" aria-label="下一周">›</button>
  </div>`;
}
function shiftWeek(d) {
  const b = weekOffsetBounds();
  let n = (S.ttWeekOffset || 0) + d;
  n = Math.max(b.min, Math.min(b.max, n));
  S.ttWeekOffset = n;
  renderTimetable();
}
function goTodayWeek() {
  S.ttWeekOffset = 0;
  renderTimetable();
}
/** 绑定周导航条的滑动手势：在 .tt-week 上左右滑动切换周（仅在横向滚动到边缘或网格未溢出时接管） */
function bindWeekNav() {
  const el = document.getElementById('ttWeek');
  if (!el) return;
  let x0 = null, y0 = null, sl = 0, moved = false;
  el.addEventListener('touchstart', e => {
    if (!e.touches.length) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    const w = el.querySelector('.tt-wrap');
    sl = w ? w.scrollLeft : 0;
    moved = false;
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (x0 == null || !e.touches.length) return;
    const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
    const w = el.querySelector('.tt-wrap');
    const atEdge = !w || (sl <= 0 && w.scrollLeft <= 0) || (sl + w.clientWidth >= w.scrollWidth - 1);
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 24 && atEdge) moved = true;
  }, { passive: true });
  el.addEventListener('touchend', e => {
    if (x0 == null || !moved) { x0 = null; return; }
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) shiftWeek(dx < 0 ? 1 : -1); // 左滑→未来周，右滑→过去周
    x0 = null; moved = false;
  }, { passive: true });
}

/** 某个星期几在「当前查看周」对应的日期（offset=周偏移，0=当周）。用于关联课外课包的实际课次与表头日期 */
function dayDate(wd, offset) {
  const base = new Date(mondayOf(today()) + 'T00:00:00');
  base.setDate(base.getDate() + (offset || 0) * 7);
  const pos = wd === 0 ? 6 : wd - 1; // 周日记末位
  base.setDate(base.getDate() + pos);
  return ymd(base);
}

/** 课外辅导课：根据课包实际课次，在课表上显示请假/补课/调课/取消标记 */
function linkSessionPill(pkgId, dateStr) {
  if (!pkgId || !dateStr) return '';
  const p = S.data.packages.find(x => x.id === pkgId);
  if (!p || !p.sessions) return '';
  const s = p.sessions.find(x => x.plannedDate === dateStr && x.status !== 'sc');
  if (!s) return '';
  if (s.rescheduled) return `<span class="tag p" style="font-size:8px;margin-top:1px">↪调课${s.origDate ? '原' + fmtDate(s.origDate) : ''}</span>`;
  if (s.status === 'lv') return `<span class="tag o" style="font-size:8px;margin-top:1px">🙋请假</span>`;
  if (s.status === 'mk') return `<span class="tag p" style="font-size:8px;margin-top:1px">🔁补课</span>`;
  if (s.status === 'no') return `<span class="tag gy" style="font-size:8px;margin-top:1px">✕取消</span>`;
  return '';
}

/** 渲染"不在常规课表位置"的课次（补课/调课到别的星期），让它们显示在真实日期上 */
function offTemplateSessionChips(dateStr) {
  const out = [];
  gPackages().forEach(p => {
    (p.sessions || []).forEach(s => {
      if (s.plannedDate !== dateStr) return;
      const tmpl = gCourses().find(c => c.packageId === p.id && Number(c.weekday) === Number(s.weekday));
      if (tmpl) return; // 已在课表常规位置显示
      const label = s.rescheduled ? '↪调课' + (s.origDate ? '(原' + fmtDate(s.origDate) + ')' : '') : s.status === 'mk' ? '🔁补课' : s.status === 'lv' ? '🙋请假' : s.status === 'no' ? '✕取消' : '📌课次';
      const cls = s.status === 'lv' ? 'o' : (s.rescheduled || s.status === 'mk') ? 'p' : 'gy';
      out.push(`<div class="tt-cell t-tutor" style="font-size:9px;opacity:.92;cursor:pointer" onclick="pkgDetail('${p.id}')">${emojiOf(p.subject)} ${label}<small>${s.start || ''}</small></div>`);
    });
  });
  return out.join('');
}

function ttWeekHTML(list) {
  const s = S.data.settings;
  const days = ttDays();
  const off = S.ttWeekOffset || 0;
  const parity = S.ttWeek === 'all' ? null : S.ttWeek;
  const vis = list.filter(c => !parity || !c.weekType || c.weekType === 'all' || c.weekType === parity);

  const colStyle = `grid-template-columns:26px repeat(${days.length},1fr)`;
  let h = `<div class="tt-wrap"><div class="tt ${off === 0 ? 'is-curweek' : ''}" style="${colStyle}">`;

  // 表头（按当前查看周的真实日期，今天高亮）
  const dayISO = {};
  h += `<div></div>` + days.map(d => {
    const iso = dayDate(d, off);
    dayISO[d] = iso;
    const md = iso ? iso.slice(5, 7) + '/' + iso.slice(8, 10) : '';
    return `<div class="tt-hd ${iso === today() ? 'today' : ''}">${WD_S[d]}<span class="d">${md}</span></div>`;
  }).join('');

  // 正课
  s.periods.forEach((p, i) => {
    h += `<div class="tt-rn">${i + 1}<i>${p.start}</i></div>`;
    days.forEach(d => { h += cellHTML(vis, d, 'main', i, off); });
  });

  // 延时课
  if (s.extendPeriods.length) {
    h += `<div class="tt-sep">🌇 延时服务</div>`;
    s.extendPeriods.forEach((p, i) => {
      h += `<div class="tt-rn">延${i + 1}<i>${p.start}</i></div>`;
      days.forEach(d => { h += cellHTML(vis, d, 'extend', i, off); });
    });
  }

  // 课外辅导
  h += `<div class="tt-sep">🎯 课外辅导</div>`;
  h += `<div class="tt-rn">课外</div>`;
  days.forEach(d => {
    const iso = dayISO[d];
    const isToday = iso === today();
    const cs = vis.filter(c => c.type === 'tutor' && Number(c.weekday) === d)
      .sort((a, b) => toMin(courseTime(a).start) - toMin(courseTime(b).start));
    if (!cs.length) {
      h += canEdit('course') ? `<div class="tt-cell empty-cell ${isToday ? 'is-today' : ''}" onclick="courseForm(null,{type:'tutor',weekday:${d}})">＋</div>` : `<div class="tt-cell empty-cell ${isToday ? 'is-today' : ''}"></div>`;
    } else {
      h += `<div style="display:flex;flex-direction:column;gap:3px">` + cs.map(c => {
        const t = courseTime(c);
        return `<div class="tt-cell t-tutor ${hasHW(c) ? 'hw-dot' : ''} ${isToday ? 'is-today' : ''}" onclick="courseDetail('${c.id}')">
          ${esc(courseTitle(c))}<small>${esc(t.start || '')}</small>${linkSessionPill(c.packageId, dayISO[d])}</div>`;
      }).join('') + offTemplateSessionChips(dayISO[d]) + `</div>`;
    }
  });

  h += `</div></div>`;
  const wkMon = mondayOf(dayDate(1, off));
  const wkInfo = termWeekOf(wkMon, curTerm());
  if (wkInfo.week < 1) h = `<div class="tt-before">📅 ${wkInfo.term ? esc(wkInfo.term.name) + ' ' : ''}本学期还没开始哦～先看看别的周吧</div>` + h;
  return h;
}

function cellHTML(list, day, type, idx, off) {
  const isToday = dayDate(day, off) === today();
  const c = list.find(x => x.type === type && Number(x.weekday) === day && Number(x.periodIdx) === idx);
  if (!c) return canEdit('course') ? `<div class="tt-cell empty-cell ${isToday ? 'is-today' : ''}" onclick="courseForm(null,{type:'${type}',weekday:${day},periodIdx:${idx}})">＋</div>` : `<div class="tt-cell empty-cell ${isToday ? 'is-today' : ''}"></div>`;
  const cls = type === 'main' ? 't-main' : 't-extend';
  const sub = c.teacher || c.location || '';
  return `<div class="tt-cell ${cls} ${hasHW(c) ? 'hw-dot' : ''} ${isToday ? 'is-today' : ''}" onclick="courseDetail('${c.id}')">
    ${esc(courseTitle(c))}${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
}

function hasHW(c) {
  return gHomeworks().some(h => h.courseId === c.id && h.status !== 'done');
}

function ttListHTML(list) {
  const days = ttDays();
  let h = '';
  days.forEach(d => {
    const cs = list.filter(c => Number(c.weekday) === d)
      .sort((a, b) => {
        const o = { main: 0, extend: 1, tutor: 2 };
        if (o[a.type] !== o[b.type]) return o[a.type] - o[b.type];
        if (a.type === 'tutor') return toMin(courseTime(a).start) - toMin(courseTime(b).start);
        return (a.periodIdx || 0) - (b.periodIdx || 0);
      });
    const isToday = dayDate(d) === today();
    h += `<div class="sec-h"><div class="sec-t ${isToday ? 'today' : ''}">${WD[d]}${isToday ? ' · 今天' : ''} <small>${cs.length} 节</small></div></div>`;
    if (!cs.length) { h += `<div class="card flat"><span class="muted">这天没有安排 🎈</span></div>`; return; }
    const dd = dayDate(d);
    h += `<div class="card">` + cs.map((c, i) => {
      const t = courseTime(c);
      return `<div class="list-i" style="${i === cs.length - 1 ? 'border-bottom:none' : ''}" onclick="courseDetail('${c.id}')">
        <div class="list-ic">${emojiOf(c.subject)}</div>
        <div class="col grow"><b class="ell" style="font-size:14px">${esc(courseTitle(c))}</b>
          <span class="muted">${t.start ? t.start + '-' + t.end : ''} ${c.teacher ? '· ' + esc(c.teacher) : ''} ${c.location ? '· ' + esc(c.location) : ''}</span></div>
        <div class="col" style="align-items:flex-end;gap:4px">
          ${c.packageId ? linkSessionPill(c.packageId, dd) : ''}
          <span class="tag ${TYPE_TAG[c.type]}">${TYPE_NAME[c.type]}</span></div></div>`;
    }).join('') + offTemplateSessionChips(dd) + `</div>`;
  });
  return h;
}

/* ---------- 课程详情 ---------- */
function courseDetail(id) {
  const c = S.data.courses.find(x => x.id === id);
  if (!c) return;
  const t = courseTime(c);
  const pkg = c.packageId ? S.data.packages.find(p => p.id === c.packageId) : null;
  const hws = gHomeworks().filter(h => h.courseId === c.id).sort((a, b) => (b.assignDate || '').localeCompare(a.assignDate || ''));
  const undone = hws.filter(h => h.status !== 'done').length;

  let body = `<div class="card" style="margin-bottom:12px">
    <div class="row"><div class="col grow">
      <b style="font-size:17px">${emojiOf(c.subject)} ${esc(courseTitle(c))}</b>
      <span class="tx2" style="margin-top:3px">${WD[Number(c.weekday)]} ${t.start ? t.start + ' - ' + t.end : ''}</span>
    </div><span class="tag ${TYPE_TAG[c.type]}">${TYPE_NAME[c.type]}</span></div>
    <div class="pkg-num" style="gap:18px">
      ${c.teacher ? `<div><b style="font-size:13px">${esc(c.teacher)}</b>老师</div>` : ''}
      ${c.location ? `<div><b style="font-size:13px">${esc(c.location)}</b>地点</div>` : ''}
      ${c.teacherContact ? `<div><b style="font-size:13px">${esc(c.teacherContact)}</b>联系方式</div>` : ''}
      <div><b style="font-size:13px">${c.weekType === 'odd' ? '单周' : c.weekType === 'even' ? '双周' : '每周'}</b>频次</div>
    </div>
    ${c.note ? `<p class="tx2" style="margin-top:9px">${esc(c.note)}</p>` : ''}
  </div>`;

  if (pkg) {
    const st = pkg.stats || { remain: 0, total: 0 };
    const todayS = (pkg.sessions || []).find(s => s.plannedDate === today());
    const nextS = (pkg.sessions || []).filter(s => s.status === 'sc').sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))[0];
    body += `<div class="card" style="margin-bottom:12px">
      <div class="row" onclick="closeSheet();go('package');setTimeout(()=>pkgDetail('${pkg.id}'),300)"><div class="col grow"><b style="font-size:14px">🎒 ${esc(pkg.name)}</b>
      <span class="muted">剩余 ${st.remain} / ${st.total} 课时 · 已上 ${st.attended || 0}</span></div>
      <button class="btn xs fu">查看课包</button></div>
      ${todayS ? `<div style="margin-top:9px;display:flex;align-items:center;gap:8px">${sessPill(todayS)} <span class="muted">今天（${fmtDate(todayS.plannedDate)}）</span></div>` : (nextS ? `<div style="margin-top:9px" class="muted">下一节：${fmtDate(nextS.plannedDate)} ${WD[Number(nextS.weekday)]} ${nextS.start}</div>` : '')}
      ${todayS && todayS.status === 'sc' ? `<button class="btn ok" style="margin-top:9px;width:100%" onclick="sessAction('${pkg.id}','${todayS.id}','attend',{note:'课表标记上课'})">✅ 标记今天已上课（扣 ${todayS.hours || pkg.hoursEach || 1} 课时）</button>` : ''}
    </div>`;
  }

  body += `<div class="sec-h" style="margin-top:4px"><div class="sec-t">📝 相关作业 <small>${undone} 项待完成</small></div>
    ${canEdit('homework') ? `<button class="btn xs" onclick="closeSheet();hwForm(null,{courseId:'${c.id}'})">+ 布置</button>` : ''}</div>`;
  body += hws.length
    ? hws.slice(0, 6).map(h => hwItemHTML(h, true)).join('')
    : `<div class="card flat center"><span class="muted">暂无作业记录</span></div>`;

  const foot = canEdit('course')
    ? `<button class="btn ghost" onclick="courseForm('${c.id}')">✏️ 编辑</button>
       <button class="btn warn" onclick="delCourse('${c.id}')">🗑 删除</button>`
    : `<button class="btn ghost" onclick="closeSheet()">关闭</button>`;
  openSheet('课程详情', body, foot);
}

function delCourse(id) {
  if (!needRole('course', '删除课程需要管理员权限')) return;
  confirmBox('删除课程', '删除后这门课会从课表中移除，已记录的作业会保留但不再关联该课程。确定吗？', async () => {
    try { await api('/courses/' + id, { method: 'DELETE' }); await refresh(); toast('已删除'); closeSheet(); }
    catch (e) { toast(e.message); }
  });
}

/* ---------- 课程表单 ---------- */
function courseForm(id, preset) {
  if (!needRole('course')) return;
  const c = id ? S.data.courses.find(x => x.id === id) : null;
  const d = Object.assign({ type: 'main', weekday: new Date().getDay() || 1, periodIdx: 0, weekType: 'all', subject: '语文' }, preset || {}, c || {});
  const s = S.data.settings;
  const isEdit = !!c;
  const pkgs = gPackages().filter(p => p.status !== 'done');

  const dayOpts = [1, 2, 3, 4, 5, 6, 0].map(x => ({ v: x, t: WD_S[x] }));
  const body = `
    ${fPick('cfType', '课程类型', [{ v: 'main', t: '🏫 学校正课' }, { v: 'extend', t: '🌇 延时课' }, { v: 'tutor', t: '🎯 课外辅导' }], d.type, 'type')}
    ${fSelect('cfSubject', '科目', subjOptions(), d.subject, true)}
    ${fInput('cfName', '课程名称', d.name, '留空则用科目名，如「奥数思维A班」')}
    <div class="f"><label>星期${isEdit ? '' : '（可多选，一次添加多天）'} <em>*</em></label>
      <div class="pick ${isEdit ? '' : 'multi'} sm" id="cfDay" ${isEdit ? '' : 'data-multi="1"'}>
        ${dayOpts.map(o => `<button type="button" data-v="${o.v}" class="${Number(d.weekday) === o.v ? 'on' : ''}">${o.t}</button>`).join('')}
      </div></div>
    <div id="cfTimeArea"></div>
    <div class="f2">${fInput('cfTeacher', '老师', d.teacher, '选填')}${fInput('cfLocation', '地点/机构', d.location, '选填')}</div>
    ${fInput('cfTeacherContact', '老师联系方式', d.teacherContact, '选填，如微信/电话')}
    ${isEdit ? fSwitch('cfSync', '同步老师/地点到同类型同科目其他课', '默认开启，保持课表一致', true) : ''}
    ${fPick('cfWeekType', '上课频次', [{ v: 'all', t: '每周' }, { v: 'odd', t: '单周' }, { v: 'even', t: '双周' }], d.weekType)}
    ${gradeHasTerms() && d.type !== 'tutor' ? fPick('cfTerm', '学期', curGradeTerms().map(t => ({ v: t.id, t: t.name })).concat([{ v: '', t: '不指定（长线/跨学期）' }]), d.termId || todayTermId() || curTerm(), 'sm') : ''}
    <div id="cfPkgArea"></div>
    ${fArea('cfNote', '备注', d.note, '选填，如需要带的教材/用品')}
  `;
  const foot = `<button class="btn ghost" onclick="closeSheet()">取消</button><button class="btn" id="cfSave">保存</button>`;

  openSheet(isEdit ? '编辑课程' : '添加课程', body, foot, () => {
    const renderTime = () => {
      const type = pickVal('#cfType');
      const area = document.getElementById('cfTimeArea');
      if (type === 'tutor') {
        area.innerHTML = `<div class="f2">
          ${fInput('cfStart', '开始时间', d.startTime || '18:30', '', 'time', true)}
          ${fInput('cfEnd', '结束时间', d.endTime || '20:00', '', 'time', true)}</div>`;
      } else {
        const arr = type === 'extend' ? s.extendPeriods : s.periods;
        area.innerHTML = fSelect('cfPeriod', '节次', arr.map((p, i) => ({ v: i, t: `${p.name}  ${p.start}-${p.end}` })), d.periodIdx, true);
      }
      const pa = document.getElementById('cfPkgArea');
      pa.innerHTML = (type === 'tutor' && pkgs.length)
        ? fSelect('cfPkg', '关联课包（上课自动提示扣课时）', [{ v: '', t: '不关联' }].concat(pkgs.map(p => ({ v: p.id, t: p.name + '（剩' + (p.stats ? p.stats.remain : 0) + '课时）' }))), d.packageId || '')
        : '';
      bindPicks(document.getElementById('sheetBody'));
    };
    renderTime();
    document.getElementById('cfType').addEventListener('click', () => setTimeout(renderTime, 0));

    document.getElementById('cfSave').onclick = async () => {
      const type = pickVal('#cfType');
      const daysSel = isEdit
        ? [Number(pickVal('#cfDay'))]
        : Array.from(document.querySelectorAll('#cfDay button.on')).map(b => Number(b.dataset.v));
      if (!daysSel.length) return toast('请选择星期');
      const base = {
        gradeId: gid(), type,
        subject: val('cfSubject'),
        name: val('cfName') || val('cfSubject'),
        teacher: val('cfTeacher'), location: val('cfLocation'), teacherContact: val('cfTeacherContact'),
        weekType: pickVal('#cfWeekType') || 'all',
        termId: d.type === 'tutor' ? null : ((pickVal('#cfTerm') || todayTermId() || curTerm()) || null),
        note: val('cfNote')
      };
      if (type === 'tutor') {
        base.startTime = val('cfStart'); base.endTime = val('cfEnd');
        base.packageId = val('cfPkg') || null; base.periodIdx = null;
      } else {
        base.periodIdx = Number(val('cfPeriod') || 0);
        base.startTime = null; base.endTime = null; base.packageId = null;
      }
      try {
        if (isEdit) {
          await api('/courses/' + id, { method: 'PUT', body: { ...base, weekday: daysSel[0] } });
          // 同类型 + 同科目：把老师/地点/联系方式同步到其余课程，保持课表显示一致
          if (isOn('cfSync') && (base.teacher || base.location || base.teacherContact)) {
            const sync = { teacher: base.teacher, location: base.location, teacherContact: base.teacherContact };
            for (const o of gCourses()) {
              if (o.id !== id && o.type === base.type && (o.subject || '') === (base.subject || '')
                && (o.teacher !== sync.teacher || o.location !== sync.location || o.teacherContact !== sync.teacherContact)) {
                await api('/courses/' + o.id, { method: 'PUT', body: sync });
              }
            }
          }
        } else {
          // 拦截完全重复的课程（同年级/类型/科目/名称/星期/节次或起止时间），避免误加导致同一时间段显示多次
          const dup = (wd) => gCourses().some(c => c.type === base.type && (c.subject || '') === (base.subject || '') && (c.name || '') === (base.name || '')
            && Number(c.weekday) === wd && (c.periodIdx ?? null) === (base.periodIdx ?? null)
            && (c.startTime || '') === (base.startTime || '') && (c.endTime || '') === (base.endTime || ''));
          let skip = 0;
          for (const wd of daysSel) {
            if (dup(wd)) { skip++; continue; }
            await api('/courses', { method: 'POST', body: { ...base, weekday: wd } });
          }
          if (skip) toast(`已跳过 ${skip} 节重复课程`);
        }
        await refresh(); closeSheet(); toast(isEdit ? '已保存' : `已添加 ${daysSel.length} 节课 🎉`);
      } catch (e) { toast(e.message); }
    };
  });
}

/* ---------- 批量录入 ---------- */
function batchForm() {
  if (!needRole('course')) return;
  const s = S.data.settings;
  const days = ttDays();
  const subs = ['', ...subjOptions()];
  const list = gCourses();
  const cellSel = (type, di, day, i) => {
    const c = list.find(x => x.type === type && Number(x.weekday) === day && Number(x.periodIdx) === i);
    return `<select data-t="${type}" data-d="${day}" data-i="${i}" style="width:100%;padding:5px 2px;font-size:11.5px;border:1.4px solid var(--bd);border-radius:8px;background:#fff;text-align:center">
      ${subs.map(x => `<option value="${x}"${c && c.subject === x ? ' selected' : ''}>${x || '—'}</option>`).join('')}</select>`;
  };
  let g = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:separate;border-spacing:3px;min-width:330px">
    <tr><td></td>${days.map(d => `<td class="center" style="font-size:11.5px;font-weight:800;color:var(--tx2)">${WD_S[d]}</td>`).join('')}</tr>`;
  s.periods.forEach((p, i) => {
    g += `<tr><td style="font-size:10px;color:var(--mu);white-space:nowrap">${i + 1}</td>${days.map(d => `<td>${cellSel('main', 0, d, i)}</td>`).join('')}</tr>`;
  });
  g += `<tr><td colspan="${days.length + 1}" style="font-size:11px;font-weight:800;color:var(--yan-d);padding-top:6px">🌇 延时课</td></tr>`;
  s.extendPeriods.forEach((p, i) => {
    g += `<tr><td style="font-size:10px;color:var(--mu)">延${i + 1}</td>${days.map(d => `<td>${cellSel('extend', 0, d, i)}</td>`).join('')}</tr>`;
  });
  g += `</table></div>`;

  openSheet('批量录入课表',
    `<p class="muted" style="margin-bottom:10px">选择每格科目，留「—」表示没课。保存后会覆盖对应格子的课程（不影响课外辅导）。</p>${g}
     <p class="muted" style="margin-top:10px">💡 延时课每天内容不同，这里直接按天填即可；需要填写老师/地点，可保存后点击课表格子补充。</p>`,
    `<button class="btn ghost" onclick="closeSheet()">取消</button><button class="btn" id="bfSave">保存课表</button>`,
    () => {
      document.getElementById('bfSave').onclick = async () => {
        const sels = Array.from(document.querySelectorAll('#sheetBody select[data-t]'));
        const btn = document.getElementById('bfSave');
        btn.disabled = true; btn.textContent = '保存中…';
        try {
          for (const el of sels) {
            const type = el.dataset.t, day = Number(el.dataset.d), i = Number(el.dataset.i), sub = el.value;
            const exist = S.data.courses.find(x => x.gradeId === gid() && x.type === type && Number(x.weekday) === day && Number(x.periodIdx) === i);
            if (!sub) { if (exist) await api('/courses/' + exist.id, { method: 'DELETE' }); continue; }
            if (exist) {
              if (exist.subject !== sub) await api('/courses/' + exist.id, { method: 'PUT', body: { subject: sub, name: sub } });
            } else {
              await api('/courses', { method: 'POST', body: { gradeId: gid(), type, subject: sub, name: sub, weekday: day, periodIdx: i, weekType: 'all' } });
            }
          }
          await refresh(); closeSheet(); toast('课表已保存 🎉');
        } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = '保存课表'; }
      };
    });
}

/* ---------- 作息设置 ---------- */
function periodForm() {
  if (!needRole('course')) return;
  const s = S.data.settings;
  const rows = (arr, key) => arr.map((p, i) => `<div class="f2" style="margin-bottom:7px;align-items:center">
    <input value="${esc(p.name)}" data-k="${key}" data-i="${i}" data-f="name" style="flex:1.1">
    <input type="time" value="${p.start}" data-k="${key}" data-i="${i}" data-f="start">
    <input type="time" value="${p.end}" data-k="${key}" data-i="${i}" data-f="end">
    <button class="btn xs ghost" onclick="rmPeriod('${key}',${i})" style="flex:0 0 auto">✕</button></div>`).join('');
  openSheet('作息时间设置',
    `<div class="sec-h" style="margin-top:0"><div class="sec-t">🏫 学校正课</div><button class="btn xs" onclick="addPeriod('periods')">+ 加一节</button></div>
     ${rows(s.periods, 'periods')}
     <div class="sec-h"><div class="sec-t">🌇 延时课</div><button class="btn xs yan" onclick="addPeriod('extendPeriods')">+ 加一节</button></div>
     ${rows(s.extendPeriods, 'extendPeriods')}
     <div style="margin-top:12px">${fSwitch('psWeekend', '课表显示周六日', '周末有课外班时打开', s.showWeekend)}</div>`,
    `<button class="btn ghost" onclick="closeSheet()">取消</button><button class="btn" id="psSave">保存</button>`,
    () => {
      document.getElementById('psSave').onclick = async () => {
        const collect = key => {
          const idxs = [...new Set(Array.from(document.querySelectorAll(`#sheetBody input[data-k="${key}"]`)).map(e => e.dataset.i))];
          return idxs.map(i => ({
            name: document.querySelector(`#sheetBody input[data-k="${key}"][data-i="${i}"][data-f="name"]`).value || ('第' + (Number(i) + 1) + '节'),
            start: document.querySelector(`#sheetBody input[data-k="${key}"][data-i="${i}"][data-f="start"]`).value,
            end: document.querySelector(`#sheetBody input[data-k="${key}"][data-i="${i}"][data-f="end"]`).value
          }));
        };
        try {
          await api('/settings', { method: 'PUT', body: { periods: collect('periods'), extendPeriods: collect('extendPeriods'), showWeekend: isOn('psWeekend') } });
          await refresh(); closeSheet(); toast('作息已更新');
        } catch (e) { toast(e.message); }
      };
    });
}
async function addPeriod(key) {
  const arr = S.data.settings[key].slice();
  const last = arr[arr.length - 1];
  const st = last ? minToHM(toMin(last.end) + 10) : '08:00';
  arr.push({ name: (key === 'periods' ? '第' + (arr.length + 1) + '节' : '延时' + (arr.length + 1)), start: st, end: minToHM(toMin(st) + 40) });
  await api('/settings', { method: 'PUT', body: { [key]: arr } });
  await refresh(); periodForm();
}
async function rmPeriod(key, i) {
  const arr = S.data.settings[key].slice();
  arr.splice(i, 1);
  await api('/settings', { method: 'PUT', body: { [key]: arr } });
  await refresh(); periodForm();
}
