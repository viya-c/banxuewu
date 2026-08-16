/* ================= 我的：家人 / 年级 / 提醒 / 数据 ================= */

function renderMe() {
  const box = document.getElementById('meBody');
  const f = S.data.family, g = curGrade();
  const r = S.data.settings.reminders;
  const grades = S.data.grades;
  const hws = gHomeworks();
  const doneRate = hws.length ? Math.round(hws.filter(h => h.status === 'done').length / hws.length * 100) : 0;

  let h = `<div class="card" style="background:linear-gradient(125deg,#FFF2F7,#EEF3FF)">
    <div class="pkg-hd">
      <div class="pkg-ic" style="background:#fff;font-size:26px">${esc(f.childAvatar || '🌸')}</div>
      <div class="col grow"><b style="font-size:17px">${esc(f.childName || '宝贝')}</b>
        <span class="muted">${esc(g ? g.name : '')} · ${esc(g && g.schoolYear ? g.schoolYear + ' 学年' : '')}</span></div>
      ${canEdit('settings') ? `<button class="btn xs ghost" onclick="familyForm()">编辑</button>` : ''}
    </div>
    <div class="pkg-num" style="margin-top:11px">
      <div><b>${gCourses().length}</b>门课程</div>
      <div><b>${gPackages().filter(p => p.status !== 'done').length}</b>个课包</div>
      <div><b>${hws.length}</b>条作业</div>
      <div><b class="ok">${doneRate}%</b>完成率</div>
    </div></div>`;

  // 当前使用者
  h += `<div class="sec-h"><div class="sec-t">👨‍👩‍👧 家庭成员 <small>${S.data.members.length} 人</small></div>
    ${canEdit('settings') ? `<button class="btn xs" onclick="memberForm()">+ 添加</button>` : ''}</div>
    <div class="card">`;
  h += S.data.members.map((m, i) => {
    const o = roleInfo(m.role);
    return `<div class="list-i" style="${i === S.data.members.length - 1 ? 'border-bottom:none' : ''}">
      <div class="list-ic">${esc(m.avatar || '👤')}</div>
      <div class="col grow"><b style="font-size:14px">${esc(m.name)}${S.who === m.name ? ' <span class="tag g">当前使用</span>' : ''}</b>
        <span class="muted">${esc(roleLabel(m.role))}</span></div>
      ${S.who === m.name ? '' : `<button class="btn xs ghost" onclick="setWho('${esc(m.name)}')">设为我</button>`}
      ${canEdit('settings') ? `<button class="btn xs ghost" onclick="memberForm('${m.id}')">✏️</button>` : ''}</div>`;
  }).join('');
  h += `<p class="muted" style="margin-top:9px">💡 把访问链接和访问码发给家人，他们在自己手机上打开就能看到同一份数据</p>
    <button class="btn block ghost sm" style="margin-top:9px" onclick="shareInfo()">📤 分享给家人</button></div>`;

  // 年级分区
  h += `<div class="sec-h"><div class="sec-t">🎓 年级分区 <small>数据独立互不干扰</small></div>
    ${canEdit('settings') ? `<button class="btn xs" onclick="gradeForm()">+ 新建</button>` : ''}</div><div class="card">`;
  h += grades.map((x, i) => `<div class="list-i" style="${i === grades.length - 1 ? 'border-bottom:none' : ''}">
      <div class="list-ic" style="background:${x.current ? 'rgba(91,140,255,.14)' : '#F0F3FC'}">${x.current ? '📗' : '📘'}</div>
      <div class="col grow"><b style="font-size:14px">${esc(x.name)} ${x.current ? '<span class="tag b">当前</span>' : x.archived ? '<span class="tag gy">已归档</span>' : ''}</b>
        <span class="muted">${esc(x.schoolYear || '')} · ${S.data.courses.filter(c => c.gradeId === x.id).length}门课 · ${S.data.exams.filter(e => e.gradeId === x.id).length}次考试</span></div>
      ${x.current ? '' : `<button class="btn xs" onclick="switchGrade('${x.id}')">切换</button>`}
      ${canEdit('settings') ? `<button class="btn xs ghost" onclick="gradeForm('${x.id}')">✏️</button>` : ''}</div>`).join('');
  h += `</div>`;

  // 提醒
  h += `<div class="sec-h"><div class="sec-t">🔔 提醒设置</div>
    ${canEdit('settings') ? `<button class="btn xs ghost" id="notifyBtn" onclick="askNotify()">开启通知</button>` : ''}</div>
    <div class="card">
      ${fSwitch('rmClass', '上课提醒', `上课前 ${r.classBefore} 分钟提醒`, r.enableClass)}
      ${fSwitch('rmHw', '作业打卡提醒', `截止前 ${r.homeworkBefore} 分钟提醒`, r.enableHomework)}
      ${fSwitch('rmPkg', '课包余额提醒', `剩余 ≤ ${r.packageLowHours} 课时时提醒`, r.enablePackage)}
      ${fSwitch('rmExam', '考试提醒', `考试前 ${r.examBefore} 天提醒`, r.enableExam)}
      ${fSwitch('rmPush', '浏览器推送通知', '需要先点右上角「开启通知」授权', r.browserPush)}
      <div class="f2" style="margin-top:12px">
        ${fInput('rmClassMin', '上课前(分钟)', r.classBefore, '', 'number')}
        ${fInput('rmHwMin', '作业前(分钟)', r.homeworkBefore, '', 'number')}
        ${fInput('rmPkgNum', '课时预警', r.packageLowHours, '', 'number')}
      </div>
      ${canEdit('settings') ? `<button class="btn block sm" onclick="saveReminders()">保存提醒设置</button>` : `<p class="muted center" style="padding:6px 0">提醒设置由管理员统一配置</p>`}
    </div>`;

  // 数据（仅管理员可见）
  if (canEdit('settings')) {
  h += `<div class="sec-h"><div class="sec-t">🗄 数据与安全</div></div><div class="card">
    <div class="list-i"><div class="list-ic">🔑</div><div class="col grow"><b style="font-size:14px">家庭访问码</b>
      <span class="muted">当前：${esc(f.accessCode || '未设置')}</span></div>
      <button class="btn xs ghost" onclick="codeForm()">修改</button></div>
    <div class="list-i"><div class="list-ic">💾</div><div class="col grow"><b style="font-size:14px">导出备份</b>
      <span class="muted">下载全部数据为 JSON 文件</span></div>
      <button class="btn xs ghost" onclick="exportData()">导出</button></div>
    <div class="list-i"><div class="list-ic">📥</div><div class="col grow"><b style="font-size:14px">恢复备份</b>
      <span class="muted">从备份文件恢复（会覆盖当前数据）</span></div>
      <button class="btn xs ghost" onclick="importData()">恢复</button></div>
    <div class="list-i"><div class="list-ic">🎁</div><div class="col grow"><b style="font-size:14px">载入示例数据</b>
      <span class="muted">先看看效果，随时可清空</span></div>
      <button class="btn xs ghost" onclick="loadDemo()">载入</button></div>
    <div class="list-i" style="border-bottom:none"><div class="list-ic">🧹</div><div class="col grow"><b style="font-size:14px">清空当前年级</b>
      <span class="muted">删除「${esc(g ? g.name : '')}」的课表/课包/作业/成绩</span></div>
      <button class="btn xs ghost" onclick="clearGradeData()">清空</button></div></div>`;
  }

  // 更新日志（默认全部折叠，点版本号展开）
  h += `<div class="sec-h"><div class="sec-t">📋 更新日志</div></div><div class="card">`;
  h += (S.data.changelog || []).map(c => `<div class="clog" style="padding:7px 0;border-bottom:1px solid var(--bd)">
    <div class="clog-h" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer">
      <b style="font-size:13.5px">v${esc(c.version)} <span class="muted" style="font-weight:400">${esc(c.date)}</span></b>
      <span class="clog-ar" style="transition:transform .15s;color:var(--mu)">▸</span></div>
    <ul class="clog-items" style="margin:5px 0 0 16px;font-size:12.5px;color:var(--tx2);line-height:1.75;display:none">${c.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('');
  h += `</div>`;

  box.innerHTML = h;
  box.querySelectorAll('.clog-h').forEach(hd => hd.onclick = () => {
    const items = hd.parentElement.querySelector('.clog-items');
    const open = items.style.display === 'none';
    items.style.display = open ? 'block' : 'none';
    hd.querySelector('.clog-ar').textContent = open ? '▾' : '▸';
  });
  bindPicks(box);
  if ('Notification' in window && Notification.permission === 'granted') {
    const b = document.getElementById('notifyBtn');
    if (b) { b.textContent = '✅ 已开启'; b.classList.add('ok'); }
  }
}

function setWho(name) {
  S.who = name;
  localStorage.setItem('sm_who', name);
  syncRole();
  refresh().catch(() => { });
  toast('已切换为「' + name + '」');
}

async function saveReminders() {
  if (!needRole('settings')) return;
  try {
    await api('/settings', {
      method: 'PUT', body: {
        reminders: {
          enableClass: isOn('rmClass'), enableHomework: isOn('rmHw'), enablePackage: isOn('rmPkg'),
          enableExam: isOn('rmExam'), browserPush: isOn('rmPush'),
          classBefore: numVal('rmClassMin', 30), homeworkBefore: numVal('rmHwMin', 60), packageLowHours: numVal('rmPkgNum', 6)
        }
      }
    });
    await refresh(); toast('提醒设置已保存');
  } catch (e) { toast(e.message); }
}

function askNotify() {
  if (!('Notification' in window)) return toast('当前浏览器不支持通知');
  Notification.requestPermission().then(p => {
    if (p === 'granted') { toast('通知已开启 🔔'); renderMe(); new Notification('星光伴学屋', { body: '通知已开启，上课和作业不会再忘啦！', icon: '/icon.png' }); }
    else toast('通知被拒绝，可在浏览器设置中开启');
  });
}

/* ---------- 家庭 / 成员 / 年级 ---------- */
function familyForm() {
  if (!needRole('settings')) return;
  const f = S.data.family;
  const avatars = ['🌸', '🌟', '🐰', '🐱', '🦄', '🌈', '🍀', '⚽', '🎈', '🐼'];
  openSheet('孩子信息',
    `${fInput('ffName', '孩子名字', f.childName, '如：小雨')}
     ${fPick('ffAva', '头像', avatars, f.childAvatar, 'sm')}
     ${fInput('ffFamily', '家庭名称', f.name, '如：我们家')}`,
    `<button class="btn ghost" onclick="closeSheet()">取消</button><button class="btn" id="ffSave">保存</button>`,
    () => {
      document.getElementById('ffSave').onclick = async () => {
        try {
          await api('/family', { method: 'PUT', body: { childName: val('ffName'), childAvatar: pickVal('#ffAva'), name: val('ffFamily') } });
          await refresh(); closeSheet(); toast('已保存');
        } catch (e) { toast(e.message); }
      };
    });
}

function memberForm(id) {
  if (!needRole('settings')) return;
  const m = id ? S.data.members.find(x => x.id === id) : null;
  const avatars = ['👨', '👩', '👴', '👵', '🌸', '👦', '👧', '🧑'];
  openSheet(m ? '编辑成员' : '添加成员',
    `${fInput('mfName', '称呼', m ? m.name : '', '如：爸爸 / 外婆', 'text', true)}
     ${fPick('mfAva', '头像', avatars, m ? m.avatar : '👨', 'sm')}
     ${fPick('mfRole', '权限', [{ v: 'admin', t: '管理员（可编辑全部）' }, { v: 'viewer', t: '访客（只读查看）' }, { v: 'child', t: '学员（可打卡 · 录成绩）' }], m ? m.role : 'admin')}`,
    `${m ? `<button class="btn warn" onclick="delMember('${m.id}')">删除</button>` : ''}
     <button class="btn" id="mfSave">保存</button>`,
    () => {
      document.getElementById('mfSave').onclick = async () => {
        if (!val('mfName')) return toast('请填写称呼');
        const body = { name: val('mfName'), avatar: pickVal('#mfAva'), role: pickVal('#mfRole') };
        try {
          if (m) await api('/members/' + id, { method: 'PUT', body });
          else await api('/members', { method: 'POST', body });
          await refresh(); closeSheet(); toast('已保存');
        } catch (e) { toast(e.message); }
      };
    });
}
function delMember(id) {
  confirmBox('删除成员', '确定删除这位家庭成员吗？', async () => {
    try { await api('/members/' + id, { method: 'DELETE' }); await refresh(); closeSheet(); toast('已删除'); }
    catch (e) { toast(e.message); }
  });
}

function gradeForm(id) {
  if (!needRole('settings')) return;
  const g = id ? S.data.grades.find(x => x.id === id) : null;
  const y = new Date().getFullYear();
  const names = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '初一', '初二', '初三'];
  const termsInit = (g && Array.isArray(g.terms) && g.terms.length) ? g.terms : defaultTermSegments(`${y}-${y + 1}`);
  const curInit = (g && g.currentTermId && termsInit.some(t => t.id === g.currentTermId)) ? g.currentTermId : termsInit[0].id;
  openSheet(g ? '编辑年级' : '新建年级分区',
    `${fInput('gfName', '年级名称', g ? g.name : '', '如：四年级', 'text', true)}
     ${fPick('gfQuick', '快速选择', names, g ? g.name : '', 'sm')}
     ${fInput('gfYear', '学年', g ? g.schoolYear : `${y}-${y + 1}`, '如：2026-2027')}
     ${fInput('gfStart', '开学日期', g ? g.startDate : '', '用于计算第几周/单双周', 'date')}
     ${g ? fSwitch('gfArch', '归档此年级', '归档后仍可切换查看历史数据', g.archived) : ''}
     ${g ? '' : `<p class="muted">💡 新建后可切换过去，课表、课包、作业、成绩都独立记录；成绩曲线可跨年级回看</p>`}
     <div class="f"><label>学期 / 阶段（设置日期区间，正课/延时课按日期自动归属）</label>
       <div id="gfTerms"></div>
       <button type="button" class="btn ghost sm" id="gfAddTerm" style="margin-top:7px">＋ 添加学期/阶段</button>
       <p class="muted" style="margin-top:8px">给每个学期/假期填 开始~结束 日期（如 上学期 2026-09-01~2027-01-20）。系统据此把「今天」自动落到对应学期；课外辅导课包按有效期自动对应。不填日期则仅作手动切换标签</p>
     </div>`,
    `${g && !g.current ? `<button class="btn warn" onclick="delGrade('${g.id}')">删除</button>` : ''}
     <button class="btn ghost" onclick="closeSheet()">取消</button><button class="btn" id="gfSave">保存</button>`,
    () => {
      document.getElementById('gfQuick').addEventListener('click', e => {
        const b = e.target.closest('button');
        if (b) document.getElementById('gfName').value = b.dataset.v;
      });
      // 学期 / 阶段管理
      const state = {
        terms: termsInit.map(t => ({ ...t })),
        currentTermId: curInit
      };
      // 日期拆成 年/月/日 三个「可滚动」下拉：移动端为滚轮选择器，月限定 1-12、日限定 1-31
      const splitDate = (v) => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? { y: m[1], m: m[2], d: m[3] } : { y: '', m: '', d: '' }; };
      const opt = (val, sel, label) => `<option value="${esc(val)}" ${Number(val) === Number(sel) ? 'selected' : ''}>${esc(label == null ? val : label)}</option>`;
      const dateTripleHTML = (which, i, v) => {
        const p = splitDate(v);
        const y0 = new Date().getFullYear();
        const sb = 'padding:5px 4px;border:1.4px solid var(--bd);border-radius:9px;font-size:12px;background:#fff';
        const years = []; for (let y = y0 - 8; y <= y0 + 12; y++) years.push(y);
        const months = []; for (let k = 1; k <= 12; k++) months.push(k);
        const days = []; for (let k = 1; k <= 31; k++) days.push(k);
        return `<span class="d3" data-i="${i}" data-which="${which}" style="display:inline-flex;align-items:center;gap:2px">
          <select class="d3y" style="${sb};width:62px">${years.map(y => opt(y, p.y, y + '年')).join('')}</select>
          <select class="d3m" style="${sb};width:48px">${months.map(k => opt(k, p.m, k + '月')).join('')}</select>
          <select class="d3d" style="${sb};width:48px">${days.map(k => opt(k, p.d, k + '日')).join('')}</select>
        </span>`;
      };
      const combineD3 = (row, which) => {
        const span = row.querySelector('.d3[data-which="' + which + '"]');
        if (!span) return '';
        const y = span.querySelector('.d3y').value;
        const m = span.querySelector('.d3m').value;
        const d = span.querySelector('.d3d').value;
        return (y && m && d) ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
      };
      const renderGfTerms = () => {
        const wrap = document.getElementById('gfTerms');
        if (!wrap) return;
        wrap.innerHTML = state.terms.map((t, i) => `
          <div class="gf-term-row" style="border:1px solid var(--bd);border-radius:10px;padding:8px;margin:7px 0">
            <div style="display:flex;align-items:center;gap:7px">
              <input class="gfTermName" data-i="${i}" value="${esc(t.name)}" placeholder="如：上学期" style="flex:1;padding:7px 9px;border:1.4px solid var(--bd);border-radius:9px;font-size:13px">
              <button type="button" class="btn xs ${state.currentTermId === t.id ? 'ok' : 'ghost'}" data-act="def" data-i="${i}">${state.currentTermId === t.id ? '★ 默认' : '设为默认'}</button>
              <button type="button" class="btn xs warn" data-act="del" data-i="${i}">删除</button>
            </div>
            <div style="display:flex;align-items:center;gap:7px;margin-top:7px;font-size:12px;color:var(--mu)">
              ${dateTripleHTML('start', i, t.start)}<span>~</span>${dateTripleHTML('end', i, t.end)}
            </div>
          </div>`).join('');
        wrap.querySelectorAll('button[data-act]').forEach(btn => btn.onclick = () => {
          const i = Number(btn.dataset.i);
          if (btn.dataset.act === 'def') { state.currentTermId = state.terms[i].id; renderGfTerms(); }
          else {
            state.terms.splice(i, 1);
            if (!state.terms.some(t => t.id === state.currentTermId)) state.currentTermId = state.terms[0] ? state.terms[0].id : '';
            renderGfTerms();
          }
        });
      };
      renderGfTerms();
      const addBtn = document.getElementById('gfAddTerm');
      if (addBtn) addBtn.onclick = () => {
        state.terms.push({ id: 'kt' + Math.random().toString(36).slice(2, 8), name: '' });
        renderGfTerms();
        const inp = document.querySelector('#gfTerms .gfTermName[data-i="' + (state.terms.length - 1) + '"]');
        if (inp) inp.focus();
      };
      document.getElementById('gfSave').onclick = async () => {
        if (!val('gfName')) return toast('请填写年级名称');
        // 把输入框里的学期名称 / 日期区间同步回 state
        document.querySelectorAll('#gfTerms .gf-term-row').forEach(row => {
          const i = Number(row.querySelector('.gfTermName').dataset.i);
          if (state.terms[i]) {
            state.terms[i].name = row.querySelector('.gfTermName').value.trim() || ('学期' + (i + 1));
            state.terms[i].start = combineD3(row, 'start');
            state.terms[i].end = combineD3(row, 'end');
          }
        });
        const terms = state.terms.map(t => ({ id: t.id, name: t.name, start: t.start || '', end: t.end || '' }));
        const body = {
          name: val('gfName'), schoolYear: val('gfYear'), startDate: val('gfStart'),
          terms, currentTermId: state.currentTermId || (terms[0] ? terms[0].id : '')
        };
        if (g) body.archived = isOn('gfArch');
        try {
          if (g) await api('/grades/' + id, { method: 'PUT', body });
          else {
            const r = await api('/grades', { method: 'POST', body: { ...body, current: false, archived: false } });
            await refresh();
            closeSheet();
            return confirmBox('切换到新年级？', `已创建「${body.name}」，要现在切换过去开始录入吗？`, () => switchGrade(r.data.id), '立即切换');
          }
          await refresh(); closeSheet(); toast('已保存');
        } catch (e) { toast(e.message); }
      };
    });
}
async function switchGrade(id) {
  try {
    await api(`/grades/${id}/activate`, { method: 'POST' });
    await refresh();
    closeSheet();
    toast('已切换到「' + curGrade().name + '」');
  } catch (e) { toast(e.message); }
}
function delGrade(id) {
  const g = S.data.grades.find(x => x.id === id);
  confirmBox('删除年级分区', `「${g.name}」下的所有课表、课包、作业、成绩都会被永久删除，无法恢复。确定吗？`, async () => {
    try { await api('/grades/' + id, { method: 'DELETE' }); await refresh(); closeSheet(); toast('已删除'); }
    catch (e) { toast(e.message); }
  });
}

function gradeSwitcher() {
  const gs = S.data.grades;
  openSheet('切换年级',
    `<div class="card">` + gs.map((x, i) => `<div class="list-i" style="${i === gs.length - 1 ? 'border-bottom:none' : ''}" onclick="switchGrade('${x.id}')">
      <div class="list-ic">${x.current ? '📗' : '📘'}</div>
      <div class="col grow"><b style="font-size:14.5px">${esc(x.name)}</b>
        <span class="muted">${esc(x.schoolYear || '')} · ${S.data.courses.filter(c => c.gradeId === x.id).length}门课</span></div>
      ${x.current ? '<span class="tag b">当前</span>' : '<button class="btn xs">切换</button>'}</div>`).join('') + `</div>`,
    `<button class="btn ghost" onclick="closeSheet()">关闭</button><button class="btn" onclick="closeSheet();gradeForm()">+ 新建年级</button>`);
}

/* ---------- 访问码 / 数据 ---------- */
function codeForm() {
  if (!needRole('settings')) return;
  openSheet('修改家庭访问码',
    `${fInput('cfCode', '新访问码', S.data.family.accessCode, '建议 4-6 位数字', 'text', true)}
     <p class="muted">修改后需要把新访问码告诉家人</p>`,
    `<button class="btn ghost" onclick="closeSheet()">取消</button><button class="btn" id="ccSave">保存</button>`,
    () => {
      document.getElementById('ccSave').onclick = async () => {
        const code = val('cfCode');
        if (!code) return toast('访问码不能为空');
        try {
          await api('/family', { method: 'PUT', body: { accessCode: code } });
          S.token = code; localStorage.setItem('sm_token', code);
          await refresh(); closeSheet(); toast('访问码已更新');
        } catch (e) { toast(e.message); }
      };
    });
}

function shareInfo() {
  const url = location.origin;
  const text = `📚 ${S.data.family.childName || '宝贝'} 的星光伴学屋\n链接：${url}\n访问码：${S.data.family.accessCode}`;
  if (navigator.share) {
    navigator.share({ title: '星光伴学屋', text }).catch(() => { });
  } else {
    navigator.clipboard && navigator.clipboard.writeText(text).then(() => toast('链接和访问码已复制，发给家人吧 📤'), () => { });
    openSheet('分享给家人',
      `<div class="card"><p style="font-size:14px;line-height:1.9;white-space:pre-wrap">${esc(text)}</p></div>
       <p class="muted">把上面的链接和访问码发给家人，他们用手机浏览器打开后，可以「添加到主屏幕」，像 App 一样使用。</p>`,
      `<button class="btn block" onclick="closeSheet()">知道了</button>`);
  }
}

function loadDemo() {
  if (!needRole('settings')) return;
  confirmBox('载入示例数据', '会在当前年级里生成一份示例课表、课包、作业和成绩，方便你先看看效果。可以随时用「清空当前年级」清掉。', async () => {
    try { await api('/demo', { method: 'POST' }); await refresh(); closeSheet(); go('timetable'); toast('示例数据已载入 🎁'); }
    catch (e) { toast(e.message); }
  }, '载入示例');
}
function clearGradeData() {
  if (!needRole('settings')) return;
  confirmBox('清空当前年级', `「${curGrade().name}」下的课表、课包、作业、成绩会被全部删除，家庭成员和设置会保留。建议先导出备份。确定吗？`, async () => {
    try { await api('/clear', { method: 'POST' }); await refresh(); closeSheet(); toast('已清空'); }
    catch (e) { toast(e.message); }
  }, '确认清空');
}

async function exportData() {
  try {
    const j = await api('/export');
    const blob = new Blob([JSON.stringify(j.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `学习管家备份-${today()}.json`;
    a.click();
    toast('备份已下载');
  } catch (e) { toast(e.message); }
}
function importData() {
  if (!needRole('settings')) return;
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = async () => {
      try {
        const data = JSON.parse(fr.result);
        confirmBox('确认恢复', '当前数据会被备份文件覆盖（系统会先自动存一份当前数据）。确定继续吗？', async () => {
          await api('/import', { method: 'POST', body: data });
          await refresh(); toast('恢复成功');
        }, '确认恢复');
      } catch (e) { toast('文件格式不正确'); }
    };
    fr.readAsText(f);
  };
  inp.click();
}
