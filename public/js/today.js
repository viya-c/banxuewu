/* ================= 今日 / 作业打卡 ================= */

/** 今日所有课程（含单双周过滤），按开始时间排序 */
function todayCourses(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const wd = d.getDay();
  const parity = weekParity().parity;
  const seen = new Set();
  return gCourses()
    .filter(c => {
      if (Number(c.weekday) !== wd || !courseActive(c, parity)) return false;
      const key = [c.type, c.subject, c.name, c.periodIdx ?? null, c.startTime || '', c.endTime || ''].join('|');
      if (seen.has(key)) return false; // 防御重复，避免同一课程显示多次
      seen.add(key);
      return true;
    })
    .map(c => ({ ...c, _t: courseTime(c) }))
    .sort((a, b) => toMin(a._t.start) - toMin(b._t.start));
}

function nextCourse() {
  const now = toMin(nowHM());
  return todayCourses().find(c => toMin(c._t.start) > now) || null;
}

function renderToday() {
  const box = document.getElementById('todayBody');
  const cs = todayCourses();
  const hws = gHomeworks();
  const t = today();
  const now = toMin(nowHM());

  // 待办：未完成的（含逾期）+ 今天完成的
  const todo = hws.filter(h => h.status !== 'done').sort((a, b) => (a.dueDate + (a.dueTime || '')).localeCompare(b.dueDate + (b.dueTime || '')));
  const doneToday = hws.filter(h => h.status === 'done' && (h.checkinAt || '').slice(0, 10) === t);

  let h = '';

  // 下节课
  const nc = nextCourse();
  if (nc) {
    const diff = toMin(nc._t.start) - now;
    const cd = diff >= 60 ? `${Math.floor(diff / 60)}<span>小时后</span>` : `${diff}<span>分钟后</span>`;
    h += `<div class="next-card" onclick="courseDetail('${nc.id}')">
      <div class="next-ic">${TYPE_EMOJI[nc.type]}</div>
      <div class="grow" style="min-width:0"><b class="ell">下节课 · ${esc(courseTitle(nc))}</b>
      <p class="ell">${nc._t.start}-${nc._t.end} ${nc.location ? '· ' + esc(nc.location) : ''} ${nc.teacher ? '· ' + esc(nc.teacher) + '老师' : ''}</p></div>
      <div class="next-cd"><b>${cd.split('<span>')[0]}</b><span>${cd.split('<span>')[1].replace('</span>', '')}</span></div></div>`;
  } else if (cs.length) {
    h += `<div class="next-card" style="background:linear-gradient(120deg,#25C685,#5BD4A8)">
      <div class="next-ic">🎉</div><div class="grow"><b>今天的课全部上完啦</b><p>记得完成作业打卡哦～</p></div></div>`;
  }

  // 打卡星星
  h += renderStarCards();

  // 每日评价（态度/方法/努力，每天一次）
  h += renderDailyRating();

  // 作业
  h += `<div class="sec-h"><div class="sec-t">📝 作业打卡 <small>${todo.length} 项待完成</small></div>
    ${canEdit('homework') ? `<button class="btn xs" onclick="hwForm()">+ 记作业</button>` : ''}</div>`;
  if (!todo.length && !doneToday.length) {
    h += `<div class="card"><div class="empty" style="padding:24px"><span class="em">🎈</span>
      <p>${canEdit('homework') ? '没有待完成的作业<br>老师布置作业后，点右上「记作业」添加' : '没有待完成的作业 🎈'}</p></div></div>`;
  } else {
    h += todo.map(x => hwItemHTML(x)).join('');
    if (doneToday.length) {
      h += `<div class="sec-h"><div class="sec-t" style="font-size:13.5px;color:var(--mu)">✅ 今日已完成 <small>${doneToday.length} 项</small></div></div>`;
      h += doneToday.map(x => hwItemHTML(x)).join('');
    }
  }

  box.innerHTML = (gradeHasTerms() ? termSegHTML() : '') + h;
  bindTermSeg();
}

function hwItemHTML(x, compact) {
  const overdue = x.status !== 'done' && x.dueDate && (x.dueDate + ' ' + (x.dueTime || '23:59')) < (today() + ' ' + nowHM());
  const c = x.courseId ? S.data.courses.find(y => y.id === x.courseId) : null;
  const src = c ? c.type : (x.source || 'main');
  let due = '';
  if (x.dueDate) {
    const rd = relDays(x.dueDate);
    const dayTx = rd === 0 ? '今天' : rd === 1 ? '明天' : rd === -1 ? '昨天' : fmtDate(x.dueDate);
    due = `${dayTx} ${x.dueTime || ''}`;
  }
  return `<div class="hw s-${src} ${x.status === 'done' ? 'done' : ''} ${overdue ? 'overdue' : ''}">
    <div class="hw-ck ${x.status === 'done' ? 'on' : ''} ${canEdit('checkin') ? `onclick="event.stopPropagation();toggleCheck('${x.id}')"` : 'ro'}>✓</div>
    <div class="hw-main" onclick="hwDetail('${x.id}')">
      <div class="hw-t">${emojiOf(x.subject)} ${esc(x.title)}</div>
      <div class="hw-meta">
        <span class="tag ${TYPE_TAG[src]}">${TYPE_NAME[src]}</span>
        ${x.subject ? `<span>${esc(x.subject)}</span>` : ''}
        ${due ? `<span style="${overdue ? 'color:var(--warn);font-weight:700' : ''}">⏰ ${due}${overdue ? ' 已逾期' : ''}</span>` : ''}
        ${x.status === 'done' && x.checkinAt ? `<span style="color:var(--ok)">✓ ${fmtDateTime(x.checkinAt)}打卡</span>` : ''}
      </div>
      ${!compact && x.images && x.images.length ? `<div class="hw-imgs">${x.images.map(u => `<img src="${esc(u)}" onclick="event.stopPropagation();window.open('${esc(u)}')">`).join('')}</div>` : ''}
    </div></div>`;
}

async function toggleCheck(id) {
  const hw = S.data.homeworks.find(x => x.id === id);
  if (!hw) return;
  if (!canEdit('checkin')) { toast('当前身份没有打卡权限'); return; }
  try {
    if (hw.status === 'done') {
      await api('/checkin/' + id, { method: 'POST', body: { cancel: true } });
      toast('已取消打卡');
    } else {
      await api('/checkin/' + id, { method: 'POST', body: { by: S.who } });
      toast('打卡成功，真棒！🎉');
    }
    await refresh();
  } catch (e) { toast(e.message); }
}

/* ---------- 作业详情 ---------- */
function hwDetail(id) {
  const x = S.data.homeworks.find(y => y.id === id);
  if (!x) return;
  const c = x.courseId ? S.data.courses.find(y => y.id === x.courseId) : null;
  const doneCard = x.status === 'done' ? `<div class="card" style="margin-bottom:12px;border:1.5px solid rgba(37,198,133,.35)">
      <b style="color:var(--ok);font-size:14px">✅ 已完成打卡</b>
      <div class="muted" style="margin-top:4px">时间：${fmtDateTime(x.checkinAt)}${x.checkinBy ? ' · ' + esc(x.checkinBy) : ''}</div>
      ${x.duration ? `<div class="muted">用时：${x.duration} 分钟</div>` : ''}
      ${(x.qual || x.att || x.meth || x.eff) ? `<div class="rate-box">
        ${x.att ? rateStarsHTML('态度', x.att) : ''}${x.meth ? rateStarsHTML('方法', x.meth) : ''}${x.eff ? rateStarsHTML('努力', x.eff) : ''}${rateStarsHTML('完成质量', x.qual)}</div>` : ''}
      ${x.checkinNote ? `<p class="tx2" style="margin-top:6px">${esc(x.checkinNote)}</p>` : ''}
      ${x.images && x.images.length ? `<div class="hw-imgs">${x.images.map(u => `<img src="${esc(u)}" onclick="window.open('${esc(u)}')">`).join('')}</div>` : ''}
    </div>` : '';
  const todoForm = canEdit('checkin') ? `<div class="f2">${fInput('ckDur', '用时（分钟）', '', '选填', 'number')}</div>
    <div class="rate-edit">
      <div class="rate-line"><span class="rate-lab">完成质量</span>${starInput('qual', x.qual)}</div>
    </div>
    ${fArea('ckNote', '打卡备注', '', '选填，如：错了2道，已订正')}
    <div class="f"><label>作业照片</label>
      <div id="ckImgs" class="hw-imgs"></div>
      <button class="btn ghost sm" style="margin-top:7px" onclick="addCkImg()">📷 拍照/选择图片</button></div>`
    : `<p class="muted">当前身份仅可查看作业，打卡请切换到管理员或孩子的身份。</p>`;
  const body = `
    <div class="card" style="margin-bottom:12px">
      <b style="font-size:16.5px">${emojiOf(x.subject)} ${esc(x.title)}</b>
      <div class="hw-meta" style="margin-top:6px">
        <span class="tag ${TYPE_TAG[c ? c.type : (x.source || 'main')]}">${TYPE_NAME[c ? c.type : (x.source || 'main')]}</span>
        ${c ? `<span>${esc(courseTitle(c))}</span>` : ''}
        <span>布置：${fmtDate(x.assignDate)}</span>
        ${x.dueDate ? `<span>截止：${fmtDate(x.dueDate)} ${x.dueTime || ''}</span>` : ''}
      </div>
      ${x.content ? `<p class="tx2" style="margin-top:9px;white-space:pre-wrap">${esc(x.content)}</p>` : ''}
    </div>
    ${x.status === 'done' ? doneCard : todoForm}
  `;
  const foot = x.status === 'done'
    ? (canEdit('checkin')
        ? `<button class="btn ghost" onclick="toggleCheck('${x.id}');closeSheet()">取消打卡</button>${canEdit('homework') ? `<button class="btn warn" onclick="delHW('${x.id}')">删除</button>` : ''}`
        : `<button class="btn ghost" onclick="closeSheet()">关闭</button>`)
    : `${canEdit('homework') ? `<button class="btn ghost" onclick="hwForm('${x.id}')">编辑</button>` : ''}${canEdit('checkin') ? `<button class="btn ok" id="ckSave">✓ 完成打卡</button>` : (canEdit('homework') ? '' : `<button class="btn ghost" onclick="closeSheet()">关闭</button>`)}`;
  openSheet('作业详情', body, foot, () => {
    window._ckImgs = [];
    const btn = document.getElementById('ckSave');
    if (btn) btn.onclick = async () => {
      try {
        await api('/checkin/' + x.id, {
          method: 'POST',
          body: {
            by: S.who, note: val('ckNote'), duration: numVal('ckDur', 0) || null,
            qual: numVal('stv_qual', 0),
            images: window._ckImgs || []
          }
        });
        await refresh(); closeSheet(); toast('打卡成功，真棒！🎉');
      } catch (e) { toast(e.message); }
    };
  });
}
async function addCkImg() {
  const urls = await pickImages(3);
  if (!urls.length) return;
  window._ckImgs = (window._ckImgs || []).concat(urls);
  document.getElementById('ckImgs').innerHTML = window._ckImgs.map(u => `<img src="${u}">`).join('');
}
function delHW(id) {
  if (!needRole('homework', '删除作业需要管理员权限')) return;
  confirmBox('删除作业', '确定删除这条作业记录吗？', async () => {
    try { await api('/homeworks/' + id, { method: 'DELETE' }); await refresh(); closeSheet(); toast('已删除'); }
    catch (e) { toast(e.message); }
  });
}

/* ---------- 作业表单 ---------- */
function hwForm(id, preset) {
  if (!needRole('homework')) return;
  const x = id ? S.data.homeworks.find(y => y.id === id) : null;
  const d = Object.assign({
    assignDate: today(), dueDate: today(), dueTime: '21:00', subject: '语文', status: 'todo'
  }, preset || {}, x || {});
  const courses = gCourses().sort((a, b) => Number(a.weekday) - Number(b.weekday));
  const initType = d.source || 'main';
  // 按课程类型过滤“来自哪节课”，并随类型切换重排
  const renderHwCourseOpts = (type) => [{ v: '', t: '不关联具体课程' }].concat(
    courses.filter(c => c.type === type).map(c => ({
      v: c.id, t: `${WD_S[Number(c.weekday)]} ${TYPE_EMOJI[c.type]} ${courseTitle(c)}`
    })));
  const copts = renderHwCourseOpts(initType);

  const body = `
    ${fPick('hwType', '课程类型', [{ v: 'main', t: '🏫 学校正课' }, { v: 'extend', t: '🌇 延时课' }, { v: 'tutor', t: '🎯 课外辅导' }], initType)}
    ${fSelect('hwCourse', '来自哪节课', copts, (d.courseId && courses.find(c => c.id === d.courseId && c.type === initType)) ? d.courseId : '')}
    ${fSelect('hwSubject', '科目', subjOptions(), d.subject, true)}
    ${fInput('hwTitle', '作业内容', d.title, '如：口算100题 / 生字抄写2遍', 'text', true)}
    ${fArea('hwContent', '详细说明', d.content, '选填，如页码、要求')}
    <div class="f2">${fInput('hwAssign', '布置日期', d.assignDate, '', 'date')}${fInput('hwDue', '截止日期', d.dueDate, '', 'date')}</div>
    ${fInput('hwTime', '截止时间', d.dueTime, '', 'time')}
    <p class="muted" style="margin-top:-4px">💡 到期前 ${S.data.settings.reminders.homeworkBefore} 分钟会自动提醒</p>`;
  openSheet(x ? '编辑作业' : '记录作业',
    body,
    `<button class="btn ghost" onclick="closeSheet()">取消</button><button class="btn" id="hwSave">保存</button>`,
    () => {
      const cs = document.getElementById('hwCourse');
      // 课程类型切换 → 重排“来自哪节课”下拉（保留当前选择，若不存在则回落到“不关联”）
      const typeEl = document.getElementById('hwType');
      if (typeEl) typeEl.addEventListener('click', () => setTimeout(() => {
        const tp = pickVal('#hwType') || 'main';
        const sel = document.getElementById('hwCourse');
        const cur = sel.value;
        sel.innerHTML = renderHwCourseOpts(tp).map(o =>
          `<option value="${esc(o.v)}"${String(cur) === String(o.v) ? ' selected' : ''}>${esc(o.t)}</option>`).join('');
      }, 0));
      cs.onchange = () => {
        const c = S.data.courses.find(y => y.id === val('hwCourse'));
        if (c) {
          document.getElementById('hwSubject').value = c.subject;
          // 选了具体课程后，把类型选择器同步到该课程的类型，保持标签一致
          const b = document.querySelector('#hwType button[data-v="' + c.type + '"]');
          if (b) { document.querySelectorAll('#hwType button').forEach(x => x.classList.remove('on')); b.classList.add('on'); }
        }
      };
      document.getElementById('hwSave').onclick = async () => {
        if (!val('hwTitle')) return toast('请填写作业内容');
        const c = S.data.courses.find(y => y.id === val('hwCourse'));
        const src = c ? c.type : (pickVal('#hwType') || 'main');
        const body = {
          gradeId: gid(), courseId: val('hwCourse') || null,
          source: src,
          termId: (c ? c.termId : null) || curTerm() || null,
          subject: val('hwSubject'), title: val('hwTitle'), content: val('hwContent'),
          assignDate: val('hwAssign'), dueDate: val('hwDue'), dueTime: val('hwTime'),
          status: d.status || 'todo'
        };
        try {
          if (x) await api('/homeworks/' + id, { method: 'PUT', body });
          else await api('/homeworks', { method: 'POST', body: { ...body, images: [] } });
          await refresh(); closeSheet(); toast('已保存');
        } catch (e) { toast(e.message); }
      };
    });
}

/* ---------- 打卡星星 ---------- */
// 累计星星总数：作业打卡(完成质量) + 每日评价(态度/方法/努力)，跨学期累计
function renderStarCards() {
  const total = totalStars();
  return `<div class="star-sec">
    <div class="star-head">⭐ 打卡星星 <b>${total}</b> 颗</div>
  </div>`;
}

/* ---------- 每日评价（态度/方法/努力，每天一次）---------- */
function renderDailyRating() {
  const d = ymd(new Date());
  const dr = dailyRatingFor(d);
  const row = (name, lab) => `<div class="rate-line"><span class="rate-lab">${lab}</span>${starInput('dr_' + name, dr ? dr[name] : 0)}</div>`;
  return `<div class="daily-sec">
    <div class="daily-head">📅 每日评价 <small>${fmtDate(d)} · 态度 / 方法 / 努力，每天一次</small></div>
    <div class="rate-edit">
      ${row('att', '态度')}
      ${row('meth', '方法')}
      ${row('eff', '努力')}
    </div>
    <button class="btn sm ok" id="drSave" onclick="saveDailyRatingClick()">${dr ? '更新今日评价' : '保存今日评价'}</button>
  </div>`;
}
async function saveDailyRatingClick() {
  const att = numVal('stv_dr_att', 0), meth = numVal('stv_dr_meth', 0), eff = numVal('stv_dr_eff', 0);
  try {
    await saveDailyRating(att, meth, eff);
    await refresh();
    toast('今日评价已保存 🌟');
  } catch (e) { toast(e.message); }
}
