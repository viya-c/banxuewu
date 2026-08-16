/* ================= 考试成绩与分数曲线 ================= */

const SUBJ_COLORS = ['#5B8CFF', '#FF7EB3', '#25C685', '#FF9F43', '#A55EEA', '#39C5D8', '#FF6B6B', '#8D9EFF'];
const EXAM_TYPES = ['单元测', '随堂测', '月考', '期中考', '期末考', '竞赛', '其他'];

function renderExams() {
  const box = document.getElementById('examBody');
  const seg = gradeHasTerms() ? termSegHTML() : '';
  const all = gExams().slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (!all.length) {
    box.innerHTML = seg + `<div class="card"><div class="empty"><span class="em">📈</span>
      <p>还没有考试记录<br>${canEdit('exam') ? '每次考完录一下分数，<br>自动生成成绩曲线，进步一目了然' : '请联系管理员或孩子的身份录入成绩'}</p>
      ${canEdit('exam') ? `<button class="btn" style="margin-top:14px" onclick="examForm()">记录第一次成绩</button>` : ''}</div></div>`;
    bindTermSeg();
    return;
  }

  const subjects = [...new Set(all.map(e => e.subject))];
  if (S.examSubject && S.examSubject !== '__all' && !subjects.includes(S.examSubject)) S.examSubject = '';
  const cur = S.examSubject || subjects[0];
  const showAll = cur === '__all';
  const list = showAll ? all : all.filter(e => e.subject === cur);
  const scored = list.filter(hasScore);

  // 统计
  const rates = scored.map(e => rateOf(e));
  const avg = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;
  const best = scored.length ? scored.reduce((m, e) => (rateOf(e) > rateOf(m) ? e : m), scored[0]) : null;
  const last2 = scored.slice(-2);
  const trend = last2.length === 2 ? Math.round(rateOf(last2[1]) - rateOf(last2[0])) : 0;

  let h = `<div class="chips" id="examChips">
    ${subjects.map(s => `<button class="chip ${cur === s ? 'on' : ''}" onclick="pickSubject('${esc(s)}')">${emojiOf(s)} ${esc(s)}</button>`).join('')}
    <button class="chip ${showAll ? 'on' : ''}" onclick="pickSubject('__all')">📊 全科对比</button>
  </div>`;

  h += `<div class="stat3">
    <div><b style="color:var(--main)">${showAll ? avg + '%' : (scored.length ? Math.round(avgScore(scored)) : '-')}</b><span>${showAll ? '平均得分率' : '平均分'}</span></div>
    <div><b style="color:var(--ok)">${best ? best.score : '-'}</b><span>最高分</span></div>
    <div><b style="color:${trend > 0 ? 'var(--ok)' : trend < 0 ? 'var(--warn)' : 'var(--mu)'}">${trend > 0 ? '↑' + trend : trend < 0 ? '↓' + Math.abs(trend) : '—'}</b><span>较上次</span></div>
  </div>`;

  h += `<div class="chart-card">${chartSVG(all, cur)}</div>`;

  h += `<div class="sec-h"><div class="sec-t">📋 成绩记录 <small>${list.length} 次</small></div>
    ${canEdit('exam') ? `<button class="btn xs" onclick="examForm()">+ 记成绩</button>` : ''}</div>`;

  h += list.slice().reverse().map(e => {
    const planned = !hasScore(e);
    const r = rateOf(e);
    const color = planned ? 'var(--mu)' : r >= 95 ? 'var(--ok)' : r >= 85 ? 'var(--main)' : r >= 70 ? 'var(--yan)' : 'var(--warn)';
    const prev = planned ? null : prevExam(all.filter(hasScore), e);
    const dv = prev ? Math.round(rateOf(e) - rateOf(prev)) : null;
    return `<div class="card" onclick="examDetail('${e.id}')">
      <div class="exam-i">
        <div class="score-ball" style="background:${color};${planned ? 'font-size:12px' : ''}">${planned ? '待考' : e.score}</div>
        <div class="col grow"><b style="font-size:14.5px" class="ell">${emojiOf(e.subject)} ${esc(e.subject)} · ${esc(e.type || '测验')}</b>
          <span class="muted ell">${fmtDate(e.date)}${e.name ? ' · ' + esc(e.name) : ''}${e.fullScore && e.fullScore != 100 ? ' · 满分' + e.fullScore : ''}${e.rank ? ' · 班级第' + e.rank : ''}</span>
          ${e.classAvg ? `<span class="muted">班级平均 ${e.classAvg}${r - (e.classAvg / (e.fullScore || 100) * 100) > 0 ? '（高于平均 ' + Math.round(r - e.classAvg / (e.fullScore || 100) * 100) + '%）' : ''}</span>` : ''}
        </div>
        ${dv !== null ? `<span class="tag ${dv > 0 ? 'g' : dv < 0 ? 'r' : 'gy'}">${dv > 0 ? '↑' + dv : dv < 0 ? '↓' + Math.abs(dv) : '持平'}</span>` : ''}
      </div>
      ${e.lostPoints ? `<p class="muted" style="margin-top:8px">❗ 失分点：${esc(e.lostPoints)}</p>` : ''}
    </div>`;
  }).join('');

  box.innerHTML = seg + h;
  bindTermSeg();
}

const hasScore = e => e.score !== null && e.score !== undefined && e.score !== '';
const rateOf = e => Math.round((Number(e.score) || 0) / (Number(e.fullScore) || 100) * 1000) / 10;
const avgScore = list => list.length ? list.reduce((s, e) => s + (Number(e.score) || 0), 0) / list.length : 0;
function prevExam(all, e) {
  const same = all.filter(x => x.subject === e.subject).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const i = same.findIndex(x => x.id === e.id);
  return i > 0 ? same[i - 1] : null;
}
function pickSubject(s) { S.examSubject = s; renderExams(); }

/* ---------- SVG 曲线 ---------- */
function chartSVG(allRaw, cur) {
  const all = allRaw.filter(hasScore);
  const W = 340, H = 190, L = 30, R = 12, T = 14, B = 34;
  const showAll = cur === '__all';
  const subjects = showAll ? [...new Set(all.map(e => e.subject))] : [cur];
  const data = subjects.map((s, i) => ({
    name: s, color: SUBJ_COLORS[i % SUBJ_COLORS.length],
    items: all.filter(e => e.subject === s).sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  })).filter(d => d.items.length);

  const allItems = data.flatMap(d => d.items);
  if (!allItems.length) return '<p class="muted center">暂无数据</p>';

  const rs = allItems.map(rateOf);
  let lo = Math.min(...rs), hi = Math.max(...rs);
  lo = Math.max(0, Math.floor((lo - 6) / 5) * 5);
  hi = Math.min(100, Math.ceil((hi + 4) / 5) * 5);
  if (hi - lo < 20) { lo = Math.max(0, hi - 20); }
  const single = !showAll && data[0];
  const fs = single && single.items.every(e => (e.fullScore || 100) == (single.items[0].fullScore || 100)) ? (single.items[0].fullScore || 100) : 0;

  const times = allItems.map(e => new Date((e.date || today()) + 'T00:00:00').getTime());
  const tMin = Math.min(...times), tMax = Math.max(...times);
  const X = t => tMax === tMin ? (L + (W - L - R) / 2) : L + (t - tMin) / (tMax - tMin) * (W - L - R);
  const Y = r => T + (hi - r) / (hi - lo) * (H - T - B);

  let g = '';
  // 网格
  for (let i = 0; i <= 4; i++) {
    const r = lo + (hi - lo) * i / 4, y = Y(r);
    const lab = fs ? Math.round(r / 100 * fs) : Math.round(r) + '%';
    g += `<line x1="${L}" y1="${y.toFixed(1)}" x2="${W - R}" y2="${y.toFixed(1)}" stroke="#EDF1F9" stroke-width="1"/>
          <text x="${L - 5}" y="${(y + 3).toFixed(1)}" font-size="8.5" fill="#9AA3BC" text-anchor="end">${lab}</text>`;
  }

  data.forEach(d => {
    const pts = d.items.map(e => ({ x: X(new Date((e.date || today()) + 'T00:00:00').getTime()), y: Y(rateOf(e)), e }));
    if (pts.length > 1) {
      // 平滑折线
      const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      if (data.length === 1) {
        g += `<path d="${path} L${pts[pts.length - 1].x.toFixed(1)},${H - B} L${pts[0].x.toFixed(1)},${H - B} Z" fill="${d.color}" opacity=".09"/>`;
      }
      g += `<path d="${path}" fill="none" stroke="${d.color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    pts.forEach((p, i) => {
      const isLast = i === pts.length - 1;
      g += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${isLast ? 4.2 : 3.2}" fill="#fff" stroke="${d.color}" stroke-width="2.2"/>`;
      if (data.length === 1) {
        g += `<text x="${p.x.toFixed(1)}" y="${(p.y - 8).toFixed(1)}" font-size="9" font-weight="700" fill="${d.color}" text-anchor="middle">${p.e.score}</text>`;
      }
    });
    // X 轴标签（单科时显示考试类型 + 日期）
    if (data.length === 1) {
      pts.forEach((p, i) => {
        if (pts.length > 6 && i % 2 === 1 && i !== pts.length - 1) return;
        const d2 = new Date(p.e.date + 'T00:00:00');
        g += `<text x="${p.x.toFixed(1)}" y="${H - B + 13}" font-size="8" fill="#9AA3BC" text-anchor="middle">${esc((p.e.type || '').slice(0, 3))}</text>
              <text x="${p.x.toFixed(1)}" y="${H - B + 23}" font-size="7.5" fill="#C2C9DC" text-anchor="middle">${d2.getMonth() + 1}/${d2.getDate()}</text>`;
      });
    }
  });

  // 班级平均虚线（单科）
  if (data.length === 1 && data[0].items.some(e => e.classAvg)) {
    const ap = data[0].items.filter(e => e.classAvg).map(e => ({
      x: X(new Date((e.date || today()) + 'T00:00:00').getTime()),
      y: Y(Math.round(Number(e.classAvg) / (Number(e.fullScore) || 100) * 1000) / 10)
    }));
    if (ap.length > 1) g += `<path d="${ap.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="#A55EEA" stroke-width="1.6" stroke-dasharray="5 4" opacity=".75"/>`;
  }

  const legend = data.length > 1
    ? `<div class="legend" style="margin-top:4px">${data.map(d => `<span><i style="background:${d.color};border-radius:50%"></i>${esc(d.name)}</span>`).join('')}</div>`
    : (data[0].items.some(e => e.classAvg) ? `<div class="legend" style="margin-top:4px"><span><i style="background:${data[0].color};border-radius:50%"></i>本人</span><span><i style="background:#A55EEA;border-radius:50%"></i>班级平均</span></div>` : '');

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${g}</svg>${legend}`;
}

/* ---------- 详情与表单 ---------- */
function examDetail(id) {
  const e = S.data.exams.find(x => x.id === id);
  if (!e) return;
  const planned = !hasScore(e);
  const r = rateOf(e);
  const prev = planned ? null : prevExam(gExams().filter(hasScore).sort((a, b) => (a.date || '').localeCompare(b.date || '')), e);
  const body = `<div class="card" style="margin-bottom:12px">
    <div class="exam-i"><div class="score-ball" style="background:${planned ? 'var(--mu)' : r >= 95 ? 'var(--ok)' : r >= 85 ? 'var(--main)' : r >= 70 ? 'var(--yan)' : 'var(--warn)'};width:60px;height:60px;font-size:${planned ? '14' : '22'}px;flex:0 0 60px">${planned ? '待考' : e.score}</div>
      <div class="col grow"><b style="font-size:16px">${emojiOf(e.subject)} ${esc(e.subject)} ${esc(e.type || '')}</b>
      <span class="muted">${fmtDate(e.date)} · 满分 ${e.fullScore || 100}${planned ? ' · 考试计划' : ' · 得分率 ' + r + '%'}</span>
      ${e.name ? `<span class="muted">${esc(e.name)}</span>` : ''}</div></div>
    <div class="pkg-num" style="margin-top:11px">
      ${e.classAvg ? `<div><b>${e.classAvg}</b>班级平均</div>` : ''}
      ${e.rank ? `<div><b>${e.rank}</b>班级排名</div>` : ''}
      ${prev ? `<div><b style="color:${e.score - prev.score >= 0 ? 'var(--ok)' : 'var(--warn)'}">${e.score - prev.score >= 0 ? '+' : ''}${Math.round((e.score - prev.score) * 10) / 10}</b>较上次</div>` : ''}
    </div>
    ${e.lostPoints ? `<p class="tx2" style="margin-top:10px"><b>失分点：</b>${esc(e.lostPoints)}</p>` : ''}
    ${e.note ? `<p class="tx2" style="margin-top:6px">${esc(e.note)}</p>` : ''}
    ${e.images && e.images.length ? `<div class="hw-imgs">${e.images.map(u => `<img src="${esc(u)}" onclick="window.open('${esc(u)}')">`).join('')}</div>` : ''}
  </div>`;
  openSheet('成绩详情', body,
    `${canEdit('exam') ? `<button class="btn ghost" onclick="examForm('${e.id}')">✏️ 编辑</button>` : ''}${isAdmin() ? `<button class="btn warn" onclick="delExam('${e.id}')">🗑 删除</button>` : ''}`);
}
function delExam(id) {
  if (!needRole('admin', '删除成绩需要管理员权限')) return;
  confirmBox('删除成绩', '确定删除这条成绩记录吗？', async () => {
    try { await api('/exams/' + id, { method: 'DELETE' }); await refresh(); closeSheet(); toast('已删除'); }
    catch (e) { toast(e.message); }
  });
}

function examForm(id) {
  if (!needRole('exam')) return;
  const e = id ? S.data.exams.find(x => x.id === id) : null;
  const d = Object.assign({ subject: S.examSubject && S.examSubject !== '__all' ? S.examSubject : '语文', type: '单元测', date: today(), fullScore: 100 }, e || {});
  const body = `
    ${fSelect('efSubject', '科目', subjOptions(), d.subject, true)}
    ${fPick('efType', '考试类型', EXAM_TYPES, d.type, 'sm')}
    ${fInput('efName', '考试名称', d.name, '选填，如：第三单元 分数的认识')}
    <div class="f2">${fInput('efScore', '得分', d.score, '未考可留空', 'number')}${fInput('efFull', '满分', d.fullScore, '', 'number')}</div>
    ${fInput('efDate', '考试日期', d.date, '', 'date', true)}
    <p class="muted" style="margin-top:-6px;margin-bottom:12px">💡 日期填将来、分数留空 = 考试计划，会提前提醒复习</p>
    <div class="f2">${fInput('efAvg', '班级平均分', d.classAvg, '选填', 'number')}${fInput('efRank', '班级排名', d.rank, '选填', 'number')}</div>
    ${fInput('efLost', '失分点', d.lostPoints, '选填，如：阅读理解-3、计算粗心-2')}
    ${fArea('efNote', '备注', d.note, '选填')}
    <div class="f"><label>试卷/错题照片</label><div id="efImgs" class="hw-imgs">${(d.images || []).map(u => `<img src="${esc(u)}">`).join('')}</div>
      <button class="btn ghost sm" style="margin-top:7px" onclick="addExamImg()">📷 添加照片</button></div>`;
  openSheet(e ? '编辑成绩' : '记录成绩', body,
    `<button class="btn ghost" onclick="closeSheet()">取消</button><button class="btn" id="efSave">保存</button>`,
    () => {
      window._efImgs = (d.images || []).slice();
      document.getElementById('efSave').onclick = async () => {
        const sv = val('efScore');
        if (!sv && val('efDate') <= today()) return toast('请填写得分（如果是将来的考试计划，请把日期改成未来日期）');
        const body = {
          gradeId: gid(), subject: val('efSubject'), type: pickVal('#efType') || '单元测', name: val('efName'),
          termId: curTerm() || null,
          score: sv === '' ? null : numVal('efScore', 0), fullScore: numVal('efFull', 100) || 100, date: val('efDate'),
          classAvg: numVal('efAvg', 0) || null, rank: numVal('efRank', 0) || null,
          lostPoints: val('efLost'), note: val('efNote'), images: window._efImgs || []
        };
        try {
          if (e) await api('/exams/' + id, { method: 'PUT', body });
          else await api('/exams', { method: 'POST', body });
          S.examSubject = body.subject;
          await refresh(); closeSheet(); toast('成绩已记录 📈');
        } catch (err) { toast(err.message); }
      };
    });
}
async function addExamImg() {
  const urls = await pickImages(4);
  if (!urls.length) return;
  window._efImgs = (window._efImgs || []).concat(urls);
  document.getElementById('efImgs').innerHTML = window._efImgs.map(u => `<img src="${u}">`).join('');
}
