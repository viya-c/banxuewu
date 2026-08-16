/**
 * 星光伴学屋 - 后端服务
 * 零依赖：仅使用 Node.js 内置模块，便于部署到任意单端口环境
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const APP_VERSION = '1.0.21';
const BUILD_NO = '20260816b';

for (const d of [DATA_DIR, BACKUP_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

/* ---------------------------- 数据层 ---------------------------- */

const uid = (p = 'id') => p + '_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');

/* 时间工具：HH:MM 与分钟互转，按上课时长推算结束时间 */
function hmToMin(hm) { if (!hm) return 0; const [h, m] = String(hm).split(':').map(Number); return (h || 0) * 60 + (m || 0); }
function minToHm(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mm = m % 60; return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); }
function endFromStart(start, durMin) { return minToHm(hmToMin(start) + (Number(durMin) || 0)); }
/** 本地日期转 YYYY-MM-DD（避免 toISOString 的 UTC 偏移导致跨天错位，引发星期错位） */
function ymd(d) { d = d instanceof Date ? d : new Date(d); if (isNaN(d)) return ''; const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }

function defaultData() {
  const gradeId = uid('g');
  return {
    version: APP_VERSION,
    createdAt: new Date().toISOString(),
    family: {
      name: '我们家',
      childName: '宝贝',
      childAvatar: '🌸',
      accessCode: '2026'
    },
    members: [
      { id: uid('m'), name: '爸爸', role: 'admin', avatar: '👨' },
      { id: uid('m'), name: '妈妈', role: 'admin', avatar: '👩' },
      { id: uid('m'), name: '宝贝', role: 'child', avatar: '🌸' }
    ],
    grades: [
      { id: gradeId, name: '三年级', schoolYear: schoolYearOf(), current: true, archived: false,
        terms: defaultTermSegments(schoolYearOf()), currentTermId: 't1',
        createdAt: new Date().toISOString() }
    ],
    settings: {
      // 学校作息节次
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
        classBefore: 30,       // 上课前 N 分钟提醒
        homeworkBefore: 60,    // 作业截止前 N 分钟提醒
        packageLowHours: 6,    // 课包剩余低于 N 课时提醒
        examBefore: 1,         // 考试前 N 天提醒
        enableClass: true,
        enableHomework: true,
        enablePackage: true,
        enableExam: true,
        browserPush: true
      },
      subjects: ['语文', '数学', '英语', '科学', '体育', '音乐', '美术', '道法', '信息', '奥数', '书法', '编程', '钢琴', '游泳', '舞蹈', '其他']
    },
    courses: [],
    packages: [],
    homeworks: [],
    exams: [],
    checkins: [],
    dailyRatings: [],
    changelog: [
      { version: '1.0.21', date: '2026-08-16', items: ['彻底移除「萌宠卡」功能：删除 100 只原创萌宠库、召唤逻辑、专属头像与 16MB PNG 图片资源；打卡星星改为仅展示累计星数，安装包更轻量', '清理前端/后端/Cloudflare Worker 部署相关代码，数据集合去除 cards'] },

      { version: '1.0.20', date: '2026-08-12', items: ['前端接入实时同步（WebSocket）能力：部署到 Cloudflare Workers 后，家人一端改动会秒级广播到其它在线设备，无需手动刷新（带去抖与断线自动重连；本地 node server.js 自动降级为回前台刷新）', 'API 请求基地址可配置：新增 public/js/config.js，部署到 GitHub Pages 时填写 Worker 地址即可，本地运行保持同源', '为后续「GitHub Pages + Cloudflare」全家实时共享部署铺平前端改造（M4）'] },
      { version: '1.0.19', date: '2026-08-07', items: ['萌宠卡「召唤日期」精确到分钟：卡片列表与详情均显示 M月D日 HH:mm（此前只到日），演示数据时间戳按 17 分钟错峰，时间线更真实', '演示数据生成的萌宠卡从 20 张扩展到 100 张：覆盖全部 100 只原创萌宠（每个物种/配色各一张），打开即可预览完整萌宠图鉴'] },
      { version: '1.0.18', date: '2026-08-06', items: ['萌宠配色与台词全面「更活泼」：accent 改为更鲜艳明亮的专属色，台词换成更有元气/治愈感的正能量短句', '头像更有区分度：新增 4 种表情（微笑/张嘴笑/眨眼/吐舌）+ 腮红变化，不同萌宠不再「长得差不多」；100 张 PNG 已按新配色重渲染', '演示数据直接生成 20 只不同萌宠卡（覆盖 20 个物种/配色），打开应用即可预览丰富头像与台词', '说明：本次头像仍是「原创 SVG 离线渲染成 PNG」（沙箱无法访问外部 AI 生图 API）；若日后有可用生图 Key/外网，可直接生成真·AI 图覆盖同名 PNG'] },
      { version: '1.0.17', date: '2026-08-05', items: ['100 只原创萌宠头像**离线栅格化为真实 PNG 图片**（public/img/chars/p01.png … p100.png，800×800px），并在 window.CUSTOM_PETS 中全部登记，app 优先加载真实图片文件，加载失败自动回退到原创 SVG', '保留原创 SVG 绘制作为兜底：若未来替换为真正的 AI/照片图片，直接覆盖同名 PNG 即可，无需改代码', '说明：本次交付的是「原创 SVG → PNG」的离线真实图片资产；沙箱环境无法访问外部 AI 生图 API，若后续有可用 API Key 或开放外网，可直接用 nano-banana-pro 等工具生成真正的 AI 图并替换'] },
      { version: '1.0.16', date: '2026-08-05', items: ['卡通人物卡升级为「原创萌宠卡」：内置 100 只**系统合成的原创萌宠**（小猫/小狗/兔子/熊猫/狮子/企鹅/水獭… 共 25 个物种，按专属色与特点各不相同），每只配正能量名字 + 经典正能量台词；头像由 petAvatarSVG 按「物种+专属色」原创绘制（SVG，零授权风险、风格统一）', '萌宠卡展示：原创萌宠头像 + 名字 + 特点 + 经典台词 + 召唤日期；每集满 20 颗星星随机召唤一只，重复单独成卡，超过 10 张可横滑', '可选覆盖：在 window.CUSTOM_PETS 登记编号并放入 public/img/chars/<编号>.png，即可用真实/AI 生成的图片替换某只萌宠头像（失败回退原创 SVG）', '移除 Twemoji 依赖（原卡通人物方案），改为纯原创绘制'] },
      { version: '1.0.15', date: '2026-08-05', items: ['英雄卡升级为「卡通人物卡」：内置 100 位经典正能量动画角色（迪士尼 / 动漫 / 小猪佩奇 / 小马宝莉 / 哆啦A梦 等），每集满 20 颗星星随机召唤一位，卡片显示专属设计头像、名称、特点、经典台词与召唤日期；重复出现的角色单独成卡，超过 10 张可左右滑动查看', '打卡维度调整：态度 / 方法 / 努力 从「每次作业」抽出，改为「每天评估一次」的独立每日表现；每次作业打卡只评「完成质量」', '修复「重排未来课次」：过去日期但仍「待上课」的课次现在会一并向前重新铺排，不再悬空造成与未来排课重复', '课包课次状态、历史已上课记录不受影响'] },
      { version: '1.0.14', date: '2026-08-05', items: ['「今日」模块改名为「作业」', '打卡星星不再用玻璃罐：每集满 20 颗星星，自动召唤一张随机的经典动画英雄卡（简笔头像 + 名称 + 特点 + 经典台词），集卡进度一目了然', '课表页：当查看的周早于当前学期第一周时，不再显示 0 或负数周次，而是提示「学期暂未开始」', '权限分类改名，去掉「孩子」字眼：一类·管理员 / 二类·学员 / 三类·访客', '首页登录页与产品名「小雨学习管家」改为「星光伴学屋」'] },
      { version: '1.0.13', date: '2026-08-04', items: ['今日页聚焦「作业打卡」：移除课程排期时间线，新增「打卡星星」区域——每次打卡按 态度/方法/努力/完成质量 四个维度（各1~5星）算星，累计满 100 颗自动装入一个新玻璃罐', '玻璃罐从正能量名字库（启航瓶·星光瓶·追梦瓶…）依次自动命名，可手动改名；罐满与正在收集都有可视化展示', '作业打卡详情升级为 4 维度星级评分，替换原「完成质量」下拉，不再出现「优秀」字样', '课表页新增「学期第几周」与左右滑动：可滑动/箭头查看过去与未来的周，当周高亮区分；按周一对齐，修复此前「滚动7天」导致的星期错位', '课包中途改上课时间答疑：历史已记录日期不会被改；修复「改上课时长会重写历史课次结束时间」的隐患（仅改未上课的）；新增「重排未来课次」按钮，可一键把待上课的未来课次搬到新周几'] },
      { version: '1.0.12', date: '2026-08-05', items: ['新增三级角色权限：进应用先选「我是谁」，不同身份看到不同界面、拥有不同权限', '一类·管理员：可编辑全部（课表/课包/作业/成绩/家庭成员/年级/提醒/数据）', '二类·孩子：仅可「作业打卡」和「录入成绩」，其余只读', '三类·家人：全部只读，仅可查看与切换身份', '身份选择界面标注一类/二类/三类与权限说明；「我的」页按身份隐藏编辑入口，家庭成员的「设为我」对所有人可用以便切换身份'] },
      { version: '1.0.11', date: '2026-08-04', items: ['更新日志默认全部折叠：点版本号展开/收起对应条目，列表更清爽', '修复：课外辅导课（课包跨多个学期/假期）在课表上只显示在某一个学期、其它学期看不到的问题——辅导课一律按「课包有效期」判定所属学期，与课包标签（如「跨 上学期·寒假」）保持一致', '年级编辑里的学期起止日期改为 年/月/日 三个可滚动下拉：移动端为滚轮选择器，月限定 1-12、日限定 1-31，录入更顺手'] },
      { version: '1.0.10', date: '2026-08-04', items: ['修复：年级设置里编辑学期日期时，原生 date 输入框在部分设备/浏览器上年月输入后跳过了「日」段。改为 年/月/日 三个独立文本框，逐段录入、自动跳段、自动过滤非数字，保存后正确组合为 YYYY-MM-DD'] },
      { version: '1.0.9', date: '2026-08-04', items: ['学期升级为「带日期区间的学期日历」：每个年级可细分 上学期/寒假/下学期/暑假 四个时段，并在年级设置里填各自的 开始~结束 日期', '正课/延时课按日期自动判定当前学期：系统依据年级设置的日期区间，把「今天」所在时段设为当前视图并展示对应课表；新增的课默认归入该学期，仍可手动切换看其它学期', '课外辅导课包按有效期自动对应：直接对照年级时段算出课包属于哪个（或哪些）学期/假期——取覆盖最长的为主标签，跨越多个时段则注明「跨 X·Y」，无需手动打标签', '学期切换条标注「今天」所在时段；打开应用默认落到今天所在学期', '升级内置示例：默认年级预置 上学期/寒假/下学期/暑假 四个时段的示例日期区间'] },
      { version: '1.0.8', date: '2026-08-04', items: ['年级支持「上学期/下学期」等多学期：年级设置里可增删、改名、设默认学期，课表/作业/成绩按当前学期独立管理，页面顶部出现学期切换条（仅配置≥2个学期时出现）', '课外辅导课包可打「学期/阶段」标签（上学期/下学期/寒假/暑假/全年长线/自定义），课包列表与详情显示对应角标，寒暑假专门买的课包、跨学期延续的课包一目了然', '课程表单新增「学期」选择，明确每节课归属哪个学期；同类型同科目课程仍支持老师/地点/联系方式一键同步', '作业、成绩均带学期归属：切换学期时只显示当前学期的作业与成绩，曲线按学期独立呈现', '升级内置示例：默认年级预置上学期/下学期，示例课包分别带下学期/全年长线标签'] },
      { version: '1.0.7', date: '2026-08-04', items: ['修复课包详情「全部课次」折叠：当前月份也能正常收起（此前因未展开时强制回退当月，导致当月永远收不起来）', '折叠状态在同一课包内的操作（标记上课/请假/补课后重渲染）中保持，不再被强制顶回当月', '切换不同课包时才重新按「默认展开当月」初始化，互不干扰'] },
      { version: '1.0.6', date: '2026-08-04', items: ['课包编辑新增「老师联系方式」，与课表课程详情一致', '记作业时新增「课程类型」选择（学校正课/延时课/课外辅导），可据类型过滤「来自哪节课」，作业标签按所选类型显示', '编辑课程详情新增「老师联系方式」，并在课程详情页展示', '同类型同科目的课程支持一键同步老师/地点/联系方式：编辑某节课保存时默认同步到其余同类型同科目课程，保持课表显示一致（可在编辑页关闭）', '生成/补充课次时跳过已存在的日期，避免与手动添加的课次产生重复日期'] },
      { version: '1.0.5', date: '2026-08-03', items: ['修复星期错位：统一用本地日期（不再用 toISOString 的 UTC 偏移），课次日期与课表星期列彻底对齐，8月3日正确显示为周一', '课包开课日/有效期截止日改为显示「年月日」', '移除课包名称旁的年份角标', '「每次课时数 + 上课时长(分钟)」移到总课时之后、每周上课时间之前', '每周上课时间保留「结束时间」输入框（禁用），按开始时间+时长自动算出并实时刷新', '「自动推算有效期」仅填入结课日并刷新提示，不再直接退出编辑页，确认后点保存生效', '课包详情的课次列表默认当月日期排在最前'] },
      { version: '1.0.4', date: '2026-08-04', items: ['调课记录原上课日期：课包课次、课次详情、课表调课标记处均显示「原 X月X日」，撤销调课自动恢复最初排定的日期'] },
      { version: '1.0.3', date: '2026-08-04', items: ['课包新增「上课时长(分钟)」：每周固定时间只需填星期+开始时间，结束时间按 开始+时长 自动推算；改时长后所有课次与关联课表的结束时间同步刷新'] },
      { version: '1.0.2', date: '2026-08-04', items: ['修复今日页同一课程重复显示的问题：新增课程时拦截完全重复项、服务端加载时自动清理历史重复课程、今日页渲染去重', '课包名称旁新增「有效期年份角标」，跨年课包显示年份区间（如 26–27），一眼看清归属年度', '新增「自动推算有效期」：按开课日+总课时+每周固定安排自动算出预计结课日并填好'] },
      { version: '1.0.1', date: '2026-08-03', items: ['课外辅导课包升级为「课次制」：支持每周固定上课时间、按总课时自动排课、六种课次状态（待上课/已上课/已请假/补课/已取消/已调课）、请假/补课/调课/顺延场景、请假扣不扣课时可配置'] },
      { version: '1.0.0', date: '2026-08-02', items: ['首个版本发布：课表、延时课、课外课包、作业打卡、成绩曲线、家人共享、上课提醒'] }
    ]
  };
}

let DB = null;
let saveTimer = null;

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      DB = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      // 版本兼容：补齐缺失字段
      const def = defaultData();
      for (const k of Object.keys(def)) if (DB[k] === undefined) DB[k] = def[k];
      for (const k of Object.keys(def.settings)) if (DB.settings[k] === undefined) DB.settings[k] = def.settings[k];
      for (const k of Object.keys(def.settings.reminders)) {
        if (DB.settings.reminders[k] === undefined) DB.settings.reminders[k] = def.settings.reminders[k];
      }
      migratePackages();
      migrateGrades();
      dedupeCourses();
      DB.version = APP_VERSION;
      // 对已存在数据补齐最新版本更新日志（defaultData 仅对缺失顶层键生效，changelog 需主动补）
      const dl = defaultData();
      if (!(DB.changelog || []).some(c => c.version === APP_VERSION)) DB.changelog = [dl.changelog[0], ...(DB.changelog || [])];
    } else {
      DB = defaultData();
      persist(true);
    }
  } catch (e) {
    console.error('[数据加载失败，启用新库]', e.message);
    DB = defaultData();
  }
}

function persist(sync = false) {
  const write = () => {
    try {
      const tmp = DATA_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(DB, null, 2), 'utf8');
      fs.renameSync(tmp, DATA_FILE);
      dailyBackup();
    } catch (e) {
      console.error('[写入失败]', e.message);
    }
  };
  if (sync) return write();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(write, 120);
}

function dailyBackup() {
  try {
    const day = ymd(new Date());
    const f = path.join(BACKUP_DIR, `data-${day}.json`);
    if (!fs.existsSync(f)) {
      fs.copyFileSync(DATA_FILE, f);
      // 仅保留最近 30 份
      const files = fs.readdirSync(BACKUP_DIR).filter(x => x.startsWith('data-')).sort();
      while (files.length > 30) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
    }
  } catch (_) { /* 忽略备份异常 */ }
}

/* ---------------------------- HTTP 工具 ---------------------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json'
};

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req, limitMB = 12) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limitMB * 1024 * 1024) { reject(new Error('数据过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('JSON 解析失败')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  // 用户上传的图片
  if (rel.startsWith('/uploads/')) {
    const f = path.join(UPLOAD_DIR, path.basename(rel));
    if (fs.existsSync(f)) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=604800' });
      return fs.createReadStream(f).pipe(res);
    }
  }
  const file = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[\/\\])+/, ''));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // 带扩展名的资源请求缺失时返回 404，避免被单页应用回退成 HTML。
    if (path.extname(rel)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    // 单页应用回退（仅无扩展名的页面导航）
    const idx = path.join(PUBLIC_DIR, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
    return fs.createReadStream(idx).pipe(res);
  }
  const ext = path.extname(file);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'max-age=3600'
  });
  fs.createReadStream(file).pipe(res);
}

/* ---------------------------- 业务逻辑 ---------------------------- */

const COLLECTIONS = ['members', 'grades', 'courses', 'packages', 'homeworks', 'exams', 'checkins', 'dailyRatings'];

function currentGrade() {
  return DB.grades.find(g => g.current) || DB.grades[0];
}

/** 课包课时统计（优先由课次 sessions 计算，兼容旧版 records 流水） */
function packageStats(pkg) {
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
  // 旧版 records 兼容
  const recs = pkg.records || [];
  const used = recs.filter(r => r.type === 'consume').reduce((s, r) => s + (Number(r.hours) || 1), 0);
  const leave = recs.filter(r => r.type === 'leave').length;
  const makeup = recs.filter(r => r.type === 'makeup').reduce((s, r) => s + (Number(r.hours) || 1), 0);
  const consumed = used;
  const remain = Math.max(0, total - consumed);
  return { total, consumed, remain, leave, makeup, attended: used, cancelled: 0, scheduled: Math.max(0, total - used), percent: total ? Math.round(consumed / total * 100) : 0 };
}

/** 修复课次日期与星期不一致（旧版 toISOString 的 UTC 偏移可能导致日期错位一天） */
function fixSessionDate(s) {
  if (!s.plannedDate || s.weekday == null) return;
  const wd = Number(s.weekday);
  const cur = new Date(s.plannedDate + 'T00:00:00');
  if (isNaN(cur) || cur.getDay() === wd) return; // 已一致
  for (let off = 1; off <= 7; off++) {
    const a = new Date(cur); a.setDate(a.getDate() - off);
    const b = new Date(cur); b.setDate(b.getDate() + off);
    if (a.getDay() === wd) { s.plannedDate = ymd(a); return; }
    if (b.getDay() === wd) { s.plannedDate = ymd(b); return; }
  }
}

/** 旧数据迁移：补齐课次制字段，并自愈日期/星期错位 */
function migratePackages() {
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
    // 历史数据若课次缺结束时间，按上课时长补齐
    (p.sessions || []).forEach(s => { if (!s.end && s.start) s.end = endFromStart(s.start, p.durationMin); });
    // 自愈日期/星期错位（旧 UTC 偏移导致）
    (p.sessions || []).forEach(fixSessionDate);
  });
}

/** 解析「2026-2027」这样的学年，返回起止年份 */
function schoolYearRange(sy) {
  const m = String(sy || '').match(/(\d{4})\s*-\s*(\d{4})/);
  if (m) return { y0: +m[1], y1: +m[2] };
  const y = new Date().getFullYear();
  return { y0: y, y1: y + 1 };
}

/** 根据日期推算所属学年（9月及以后归新学年）。用于新建年级时默认学年贴合「今天」 */
function schoolYearOf(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const y = d.getFullYear();
  const sy = d.getMonth() >= 8 ? y : y - 1; // 9月起属新学年
  return sy + '-' + (sy + 1);
}

/** 年级默认四个时段（上学期/寒假/下学期/暑假）及示例日期区间，可按实际调整 */
function defaultTermSegments(sy) {
  const { y0, y1 } = schoolYearRange(sy);
  return [
    { id: 't1', name: '上学期', start: `${y0}-09-01`, end: `${y1}-01-20` },
    { id: 't2', name: '寒假', start: `${y1}-01-21`, end: `${y1}-02-15` },
    { id: 't3', name: '下学期', start: `${y1}-02-16`, end: `${y1}-07-05` },
    { id: 't4', name: '暑假', start: `${y1}-07-06`, end: `${y1}-08-31` }
  ];
}

/** 年级学期：老数据补齐 terms/currentTermId 与日期区间；把缺 termId 的课程归入当前学期 */
function migrateGrades() {
  (DB.grades || []).forEach(g => {
    const defs = defaultTermSegments(g.schoolYear);
    if (!Array.isArray(g.terms) || !g.terms.length) {
      g.terms = defs;
    } else {
      const exById = {}, exByName = {};
      g.terms.forEach(t => { exById[t.id] = t; if (t.name) exByName[t.name] = t; });
      g.terms = defs.map(d => {
        const ex = exById[d.id] || exByName[d.name] || null;
        return ex
          ? { id: ex.id, name: ex.name || d.name, start: ex.start || d.start, end: ex.end || d.end }
          : d;
      });
    }
    if (!g.currentTermId || !g.terms.some(t => t.id === g.currentTermId)) g.currentTermId = g.terms[0].id;
    const def = g.currentTermId;
    (DB.courses || []).filter(c => c.gradeId === g.id && !c.termId).forEach(c => { c.termId = def; });
  });
}

/** 清理完全重复的课程条目（同年级/类型/科目/名称/星期/节次或起止时间），避免同一时间段在课表/今日页重复显示 */
function dedupeCourses() {
  if (!Array.isArray(DB.courses)) return;
  const seen = new Set();
  const keep = [];
  for (const c of DB.courses) {
    const key = [c.gradeId, c.type, c.subject, c.name, c.weekday, c.periodIdx ?? null, c.startTime || '', c.endTime || ''].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    keep.push(c);
  }
  if (keep.length !== DB.courses.length) {
    console.log(`[数据清理] 移除 ${DB.courses.length - keep.length} 条重复课程`);
    DB.courses = keep;
    persist(true);
  }
}

/** 依据开课时间 + 总课时 + 每周固定安排，推算预计结课日期（最后一节课的日期） */
function projectEndDate(pkg) {
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

/** 依据每周固定时间与总课时，自动补齐未来的课次 */
function ensureSessions(pkg) {
  pkg.sessions = pkg.sessions || [];
  const target = Math.ceil((Number(pkg.totalHours) || 0) / (Number(pkg.hoursEach) || 1));
  if (!target) return pkg.sessions.length;
  const sched = (pkg.schedule && pkg.schedule.length) ? pkg.schedule : null;
  if (!sched) return pkg.sessions.length;
  // 每次上课结束时间 = 本节课开始时间 + 上课时长；已上课(at)的历史课次不动，避免改动已记录数据
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
      if (pkg.sessions.some(s => s.plannedDate === plannedDate)) continue; // 跳过已存在的日期（如手动添加的课次），避免重复
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
  // 未手动填写有效期时，自动按"开课时间 + 课时数 + 上课安排"推算结课日
  if (!pkg.endDate && pkg.sessions.length) pkg.endDate = pkg.sessions[pkg.sessions.length - 1].plannedDate;
  return count;
}

/** 为请假/补课查找下一个空闲的固定上课日期 */
function nextFreeSlot(pkg, from) {
  const sched = pkg.schedule || [];
  const occupied = new Set((pkg.sessions || []).map(x => x.plannedDate));
  let d = from && from.plannedDate ? new Date(from.plannedDate + 'T00:00:00') : new Date();
  let guard = 0;
  while (guard++ < 400) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (sched.some(s => Number(s.weekday) === wd) && !occupied.has(ymd(d))) {
      return ymd(d);
    }
  }
  const fallback = new Date((from && from.plannedDate ? from.plannedDate : new Date()) + 'T00:00:00');
  fallback.setDate(fallback.getDate() + 7);
  return ymd(fallback);
}

/** 生成一份贴近真实使用的示例数据，方便快速体验 */


function seedDemo(gradeId) {
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return ymd(x); };
  const mk = (o) => ({ id: uid('x'), gradeId, createdAt: new Date().toISOString(), ...o });

  // 依据每周固定时间生成课次：过去的标为「已上课」，未来的标为「待上课」
  function buildSessions(pkg) {
    const sched = pkg.schedule, target = Math.ceil((Number(pkg.totalHours) || 0) / (Number(pkg.hoursEach) || 1));
    const today0 = new Date(); today0.setHours(0, 0, 0, 0);
    const res = []; let made = 0; let dd = new Date((pkg.startDate || d(0)) + 'T00:00:00'); let g = 0;
    while (made < target && g++ < 3000) {
      const wd = dd.getDay();
      const slot = sched.find(s => Number(s.weekday) === wd);
      if (slot) {
        const past = dd < today0;
        res.push({
          id: uid('s'), idx: made, plannedDate: ymd(dd), weekday: wd,
          start: slot.start, end: slot.end || endFromStart(slot.start, pkg.durationMin), status: past ? 'at' : 'sc',
          rescheduled: false, makeupOf: null, hours: Number(pkg.hoursEach) || 1,
          note: past ? '已上课' : '', createdAt: new Date().toISOString()
        });
        made++;
      }
      dd.setDate(dd.getDate() + 1);
    }
    pkg.sessions = res;
  }

  const main = [
    ['语文', '数学', '英语', '语文', '数学'],
    ['数学', '语文', '语文', '数学', '语文'],
    ['英语', '科学', '体育', '英语', '美术'],
    ['体育', '英语', '道法', '语文', '科学'],
    ['音乐', '美术', '数学', '体育', '音乐'],
    ['科学', '道法', '音乐', '信息', '班会']
  ];
  main.forEach((row, pi) => row.forEach((sub, di) => {
    DB.courses.push(mk({ type: 'main', subject: sub === '班会' ? '其他' : sub, name: sub, weekday: di + 1, periodIdx: pi, weekType: 'all', teacher: '' }));
  }));

  const extend = [['作业辅导', '阅读社团'], ['书法', '科创'], ['作业辅导', '合唱'], ['篮球', '阅读社团'], ['作业辅导', '手工']];
  extend.forEach((row, di) => row.forEach((nm, pi) => {
    DB.courses.push(mk({ type: 'extend', subject: nm.includes('作业') ? '其他' : (nm === '阅读社团' ? '阅读' : nm), name: nm, weekday: di + 1, periodIdx: pi, weekType: 'all', location: '本班教室' })
    );
  }));

  const p1 = mk({ subject: '奥数', name: '奥数思维春季班', org: '明智教育', teacher: '王', totalHours: 32, price: 4800, unitPrice: 150, startDate: d(-120), endDate: d(60), status: 'active', leaveRule: 'keep', hoursEach: 1, durationMin: 90, schedule: [{ weekday: 2, start: '19:00' }], term: 's2', records: [], sessions: [] });
  const p2 = mk({ subject: '英语', name: '外教口语 1v1', org: '阳光英语', teacher: 'Lucy', totalHours: 24, price: 6000, unitPrice: 250, startDate: d(-150), endDate: d(30), status: 'active', leaveRule: 'keep', hoursEach: 1, durationMin: 60, schedule: [{ weekday: 4, start: '18:30' }], term: 'all', records: [], sessions: [] });
  const p3 = mk({ subject: '钢琴', name: '钢琴陪练课', org: '小音符琴行', teacher: '周', totalHours: 48, price: 7200, unitPrice: 150, startDate: d(-40), endDate: d(300), status: 'active', leaveRule: 'deduct', hoursEach: 1, durationMin: 60, schedule: [{ weekday: 6, start: '10:00' }], term: 'all', records: [], sessions: [] });

  buildSessions(p1); buildSessions(p2); buildSessions(p3);

  // 英语课：演示「请假 + 补课」场景
  if (p2.sessions.length > 6) {
    const lv = p2.sessions.find(s => s.status === 'at' && s.plannedDate <= d(0) && s.plannedDate >= d(-21));
    if (lv) {
      lv.status = 'lv'; lv.note = '发烧请假，已约补课';
      const mkDate = nextFreeSlot(p2, lv);
      p2.sessions.push({
        id: uid('s'), idx: p2.sessions.length, plannedDate: mkDate, weekday: new Date(mkDate + 'T00:00:00').getDay(),
        start: lv.start, end: lv.end, status: 'mk', rescheduled: false, makeupOf: lv.id,
        hours: p2.hoursEach, note: '补课（原 ' + lv.plannedDate + ' 请假）', createdAt: new Date().toISOString()
      });
    }
  }
  // 钢琴课：演示「调课」场景（把最近一次待上课挪到明天，保留原日期可查）
  {
    const sc = p3.sessions.find(s => s.status === 'sc');
    if (sc) { sc.origDate = sc.plannedDate; sc.rescheduled = true; const t = new Date(); t.setDate(t.getDate() + 1); sc.plannedDate = ymd(t); sc.weekday = t.getDay(); sc.note = '调课至明天'; }
  }

  DB.packages.push(p1, p2, p3);

  DB.courses.push(mk({ type: 'tutor', subject: '奥数', name: '奥数思维', weekday: 2, startTime: '19:00', endTime: '20:30', weekType: 'all', org: '明智教育', location: '明智教育3楼', packageId: p1.id }));
  DB.courses.push(mk({ type: 'tutor', subject: '英语', name: '外教口语', weekday: 4, startTime: '18:30', endTime: '19:30', weekType: 'all', location: '线上', packageId: p2.id }));
  DB.courses.push(mk({ type: 'tutor', subject: '钢琴', name: '钢琴陪练', weekday: 6, startTime: '10:00', endTime: '11:00', weekType: 'all', location: '小音符琴行', packageId: p3.id }));

  const hws = [
    { subject: '语文', title: '生字抄写2遍 + 背诵古诗', dueDate: d(0), dueTime: '20:30', status: 'done', checkinAt: new Date(Date.now() - 3600e3).toISOString(), quality: '优秀 ⭐⭐⭐', duration: 25 },
    { subject: '数学', title: '口算100题（第12页）', dueDate: d(0), dueTime: '21:00', status: 'todo' },
    { subject: '英语', title: '跟读 Unit5 课文并录音', dueDate: d(0), dueTime: '21:00', status: 'todo' },
    { subject: '奥数', title: '思维训练卷第3页', dueDate: d(1), dueTime: '20:00', status: 'todo' },
    { subject: '语文', title: '阅读课外书30分钟', dueDate: d(-1), dueTime: '21:00', status: 'done', checkinAt: new Date(Date.now() - 86400e3).toISOString(), quality: '良好 ⭐⭐' }
  ];
  hws.forEach(h => DB.homeworks.push(mk({ source: 'main', assignDate: d(0), images: [], ...h })));

  const exams = [
    ['语文', '单元测', 88, 82, d(-120)], ['语文', '单元测', 91, 84, d(-95)], ['语文', '期中考', 86, 80, d(-70)],
    ['语文', '单元测', 94, 85, d(-40)], ['语文', '期末考', 98, 86, d(-10)],
    ['数学', '单元测', 92, 85, d(-118)], ['数学', '单元测', 85, 83, d(-92)], ['数学', '期中考', 90, 81, d(-70)],
    ['数学', '单元测', 96, 86, d(-38)], ['数学', '期末考', 95, 84, d(-10)],
    ['英语', '单元测', 96, 88, d(-115)], ['英语', '期中考', 93, 85, d(-70)], ['英语', '期末考', 99, 89, d(-10)]
  ];
  exams.forEach(([sub, type, score, avg, date], i) => DB.exams.push(mk({
    subject: sub, type, score, fullScore: 100, classAvg: avg, date,
    rank: Math.max(1, 8 - Math.floor(score / 12)),
    lostPoints: score < 95 ? (sub === '语文' ? '阅读理解-6、错别字-2' : sub === '数学' ? '应用题-5、计算粗心-3' : '听力-2') : ''
  })));
  DB.exams.push(mk({ subject: '数学', type: '单元测', score: null, fullScore: 100, date: d(3), name: '第一单元 位置与方向' }));


}

function handleAPI(req, res, urlPath, query) {
  const seg = urlPath.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = req.method.toUpperCase();

  // ---- 无需鉴权 ----
  if (seg[0] === 'meta') {
    return sendJSON(res, 200, {
      ok: true,
      version: APP_VERSION,
      build: BUILD_NO,
      familyName: DB.family.name,
      childName: DB.family.childName,
      childAvatar: DB.family.childAvatar,
      needCode: !!DB.family.accessCode
    });
  }

  if (seg[0] === 'login' && method === 'POST') {
    return readBody(req).then(body => {
      const ok = String(body.code || '').trim() === String(DB.family.accessCode || '').trim();
      if (!ok) return sendJSON(res, 401, { ok: false, error: '访问码不正确' });
      return sendJSON(res, 200, { ok: true, token: DB.family.accessCode });
    }).catch(e => sendJSON(res, 400, { ok: false, error: e.message }));
  }

  // ---- 鉴权 ----
  const token = req.headers['x-access-code'] || query.code || '';
  if (DB.family.accessCode && String(token) !== String(DB.family.accessCode)) {
    return sendJSON(res, 401, { ok: false, error: '未授权，请输入家庭访问码' });
  }

  // 全量状态
  if (seg[0] === 'state' && method === 'GET') {
    const pkgs = DB.packages.map(p => ({ ...p, stats: packageStats(p) }));
    return sendJSON(res, 200, {
      ok: true,
      data: { ...DB, packages: pkgs },
      meta: { version: APP_VERSION, build: BUILD_NO, serverTime: new Date().toISOString() }
    });
  }

  // 家庭信息 / 设置
  if (seg[0] === 'family' && method === 'PUT') {
    return readBody(req).then(body => {
      Object.assign(DB.family, body);
      persist();
      sendJSON(res, 200, { ok: true, data: DB.family });
    }).catch(e => sendJSON(res, 400, { ok: false, error: e.message }));
  }

  if (seg[0] === 'settings' && method === 'PUT') {
    return readBody(req).then(body => {
      DB.settings = { ...DB.settings, ...body, reminders: { ...DB.settings.reminders, ...(body.reminders || {}) } };
      persist();
      sendJSON(res, 200, { ok: true, data: DB.settings });
    }).catch(e => sendJSON(res, 400, { ok: false, error: e.message }));
  }

  // 切换当前年级
  if (seg[0] === 'grades' && seg[2] === 'activate' && method === 'POST') {
    DB.grades.forEach(g => g.current = (g.id === seg[1]));
    persist();
    return sendJSON(res, 200, { ok: true, data: DB.grades });
  }

  // 课包消课记录
  if (seg[0] === 'packages' && seg[2] === 'records') {
    const pkg = DB.packages.find(p => p.id === seg[1]);
    if (!pkg) return sendJSON(res, 404, { ok: false, error: '课包不存在' });
    pkg.records = pkg.records || [];
    if (method === 'POST') {
      return readBody(req).then(body => {
        const rec = { id: uid('r'), date: body.date || ymd(new Date()), type: body.type || 'consume', hours: Number(body.hours) || 1, note: body.note || '', createdAt: new Date().toISOString() };
        pkg.records.unshift(rec);
        persist();
        sendJSON(res, 200, { ok: true, data: { ...pkg, stats: packageStats(pkg) } });
      }).catch(e => sendJSON(res, 400, { ok: false, error: e.message }));
    }
    if (method === 'DELETE' && seg[3]) {
      pkg.records = pkg.records.filter(r => r.id !== seg[3]);
      persist();
      return sendJSON(res, 200, { ok: true, data: { ...pkg, stats: packageStats(pkg) } });
    }
  }

  // 自动生成 / 补充课次
  if (seg[0] === 'packages' && seg[2] === 'generate' && method === 'POST') {
    const pkg = DB.packages.find(p => p.id === seg[1]);
    if (!pkg) return sendJSON(res, 404, { ok: false, error: '课包不存在' });
    const n = ensureSessions(pkg);
    persist();
    return sendJSON(res, 200, { ok: true, data: { ...pkg, stats: packageStats(pkg) }, generated: n });
  }

  // 重排未来待上课次到新周几：全部「待上课」(含已过期的过去日期)一并向前铺排，
  // 避免过去的待上课课次悬空、与未来排课在时间轴上"叠加"出现两次
  if (seg[0] === 'packages' && seg[2] === 'reschedule-future' && method === 'POST') {
    const pkg = DB.packages.find(p => p.id === seg[1]);
    if (!pkg) return sendJSON(res, 404, { ok: false, error: '课包不存在' });
    const sched = pkg.schedule || [];
    if (!sched.length) return sendJSON(res, 400, { ok: false, error: '请先在课包里设置每周上课时间' });
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    // 全部「待上课」课次（无论过去还是未来）都参与向前重排
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
    persist();
    return sendJSON(res, 200, { ok: true, data: { ...pkg, stats: packageStats(pkg) }, moved: pend.length });
  }

  // 按"开课时间 + 课时数 + 上课安排"自动推算有效期，并据其补齐课次
  if (seg[0] === 'packages' && seg[2] === 'autoend' && method === 'POST') {
    const pkg = DB.packages.find(p => p.id === seg[1]);
    if (!pkg) return sendJSON(res, 404, { ok: false, error: '课包不存在' });
    const end = projectEndDate(pkg);
    if (!end) return sendJSON(res, 400, { ok: false, error: '请先设置总课时与每周上课时间' });
    pkg.endDate = end;
    const n = ensureSessions(pkg);
    persist();
    return sendJSON(res, 200, { ok: true, data: { ...pkg, stats: packageStats(pkg) }, endDate: end, generated: n });
  }

  // 课次动作：上课 / 请假 / 取消 / 调课 / 补课 / 顺延 / 撤销
  if (seg[0] === 'packages' && seg[2] === 'sessions' && seg[4] === 'action' && method === 'POST') {
    const pkg = DB.packages.find(p => p.id === seg[1]);
    if (!pkg) return sendJSON(res, 404, { ok: false, error: '课包不存在' });
    pkg.sessions = pkg.sessions || [];
    const s = pkg.sessions.find(x => x.id === seg[3]);
    if (!s) return sendJSON(res, 404, { ok: false, error: '课次不存在' });
    return readBody(req).then(body => {
      const act = body.action;
      if (act === 'attend') { s.status = 'at'; if (body.note !== undefined) s.note = body.note; }
      else if (act === 'leave') { s.status = 'lv'; if (body.note !== undefined) s.note = body.note; }
      else if (act === 'cancel') { s.status = 'no'; }
      else       if (act === 'undo') { s.status = 'sc'; s.rescheduled = false; if (s.origDate) { s.plannedDate = s.origDate; s.weekday = new Date(s.origDate + 'T00:00:00').getDay(); } s.origDate = null; }
      else if (act === 'reschedule') {
        if (!body.date) return sendJSON(res, 400, { ok: false, error: '请选择调课后的日期' });
        if (!s.origDate) s.origDate = s.plannedDate; // 记住最初排定的上课日期
        s.plannedDate = body.date; s.weekday = new Date(body.date + 'T00:00:00').getDay(); s.rescheduled = true;
        if (body.start) s.start = body.start;
        if (body.end) s.end = body.end;
      }
      else if (act === 'makeup' || act === 'postpone') {
        let date = body.date;
        if (act === 'postpone' || !date) date = nextFreeSlot(pkg, s);
        const wd = new Date(date + 'T00:00:00').getDay();
        const slot = (pkg.schedule || []).find(x => Number(x.weekday) === wd) || { start: s.start, end: s.end };
        pkg.sessions.push({
          id: uid('s'), idx: pkg.sessions.length,
          plannedDate: date, weekday: wd,
          start: body.start || slot.start, end: body.end || slot.end,
          status: 'mk', rescheduled: false, makeupOf: s.id,
          hours: Number(s.hours) || Number(pkg.hoursEach) || 1,
          note: body.note || (act === 'postpone' ? '顺延补课' : '补课'),
          createdAt: new Date().toISOString()
        });
        s.status = 'lv';
        s.note = (s.note ? s.note + '；' : '') + '已安排补课';
      }
      else return sendJSON(res, 400, { ok: false, error: '未知动作' });
      s.updatedAt = new Date().toISOString();
      persist();
      sendJSON(res, 200, { ok: true, data: { ...pkg, stats: packageStats(pkg) } });
    }).catch(e => sendJSON(res, 400, { ok: false, error: e.message }));
  }

  // 课包课次 CRUD
  if (seg[0] === 'packages' && seg[2] === 'sessions') {
    const pkg = DB.packages.find(p => p.id === seg[1]);
    if (!pkg) return sendJSON(res, 404, { ok: false, error: '课包不存在' });
    pkg.sessions = pkg.sessions || [];
    if (seg[3]) {
      const s = pkg.sessions.find(x => x.id === seg[3]);
      if (!s) return sendJSON(res, 404, { ok: false, error: '课次不存在' });
      if (method === 'PUT') {
        return readBody(req).then(body => {
          if (body.status) s.status = body.status;
          if (body.note !== undefined) s.note = body.note;
          if (body.plannedDate) { s.plannedDate = body.plannedDate; s.weekday = new Date(body.plannedDate + 'T00:00:00').getDay(); }
          if (body.start) s.start = body.start;
          if (body.end) s.end = body.end;
          if (body.hours != null) s.hours = Number(body.hours) || 1;
          s.updatedAt = new Date().toISOString();
          persist();
          sendJSON(res, 200, { ok: true, data: { ...pkg, stats: packageStats(pkg) } });
        }).catch(e => sendJSON(res, 400, { ok: false, error: e.message }));
      }
      if (method === 'DELETE') {
        pkg.sessions = pkg.sessions.filter(x => x.id !== seg[3]);
        persist();
        return sendJSON(res, 200, { ok: true, data: { ...pkg, stats: packageStats(pkg) } });
      }
    }
    if (method === 'POST') {
      return readBody(req).then(body => {
        const sess = {
          id: uid('s'), idx: pkg.sessions.length,
          plannedDate: body.plannedDate || ymd(new Date()),
          weekday: body.weekday != null ? Number(body.weekday) : new Date((body.plannedDate || ymd(new Date())) + 'T00:00:00').getDay(),
          start: body.start || (pkg.schedule[0] && pkg.schedule[0].start) || '',
          end: body.end || (pkg.schedule[0] && pkg.schedule[0].end) || '',
          status: body.status || 'sc',
          rescheduled: !!body.rescheduled,
          makeupOf: body.makeupOf || null,
          hours: body.hours != null ? Number(body.hours) : (Number(pkg.hoursEach) || 1),
          note: body.note || '',
          createdAt: new Date().toISOString()
        };
        pkg.sessions.push(sess);
        persist();
        sendJSON(res, 200, { ok: true, data: { ...pkg, stats: packageStats(pkg) } });
      }).catch(e => sendJSON(res, 400, { ok: false, error: e.message }));
    }
  }



  // 每日评价（态度/方法/努力，每天一次）按 年级+日期 upsert，需在通用集合 CRUD 之前处理
  if (seg[0] === 'daily-ratings' && method === 'POST') {
    return readBody(req).then(body => {
      const gradeId = body.gradeId || (DB.grades && (DB.grades.find(g => g.current) || DB.grades[0] || {}).id) || '';
      const date = body.date || ymd(new Date());
      if (!date) return sendJSON(res, 400, { ok: false, error: '缺少日期' });
      DB.dailyRatings = DB.dailyRatings || [];
      let r = DB.dailyRatings.find(x => x.gradeId === gradeId && x.date === date);
      if (!r) { r = { id: uid('dr'), gradeId, date, createdAt: new Date().toISOString() }; DB.dailyRatings.push(r); }
      r.att = body.att != null ? Number(body.att) : (r.att || 0);
      r.meth = body.meth != null ? Number(body.meth) : (r.meth || 0);
      r.eff = body.eff != null ? Number(body.eff) : (r.eff || 0);
      r.by = body.by || r.by || '';
      r.updatedAt = new Date().toISOString();
      persist();
      return sendJSON(res, 200, { ok: true, data: r });
    }).catch(e => sendJSON(res, 400, { ok: false, error: e.message }));
  }

  // 通用集合 CRUD
  const col = seg[0];
  if (COLLECTIONS.includes(col)) {
    const list = DB[col];
    if (method === 'GET') return sendJSON(res, 200, { ok: true, data: list });

    if (method === 'POST') {
      return readBody(req).then(body => {
        const item = { id: uid(col[0]), createdAt: new Date().toISOString(), ...body };
        if (col === 'packages') item.records = item.records || [];
        if (col === 'grades') {
          if (item.current) DB.grades.forEach(g => g.current = false);
          item.archived = !!item.archived;
        }
        list.push(item);
        persist();
        sendJSON(res, 200, { ok: true, data: col === 'packages' ? { ...item, stats: packageStats(item) } : item });
      }).catch(e => sendJSON(res, 400, { ok: false, error: e.message }));
    }

    if (method === 'PUT' && seg[1]) {
      return readBody(req).then(body => {
        const i = list.findIndex(x => x.id === seg[1]);
        if (i < 0) return sendJSON(res, 404, { ok: false, error: '记录不存在' });
        list[i] = { ...list[i], ...body, id: list[i].id, updatedAt: new Date().toISOString() };
        if (col === 'grades' && body.current) DB.grades.forEach(g => { if (g.id !== seg[1]) g.current = false; });
        persist();
        sendJSON(res, 200, { ok: true, data: col === 'packages' ? { ...list[i], stats: packageStats(list[i]) } : list[i] });
      }).catch(e => sendJSON(res, 400, { ok: false, error: e.message }));
    }

    if (method === 'DELETE' && seg[1]) {
      const i = list.findIndex(x => x.id === seg[1]);
      if (i < 0) return sendJSON(res, 404, { ok: false, error: '记录不存在' });
      const [removed] = list.splice(i, 1);
      // 级联清理
      if (col === 'grades') {
        DB.courses = DB.courses.filter(c => c.gradeId !== removed.id);
        DB.packages = DB.packages.filter(p => p.gradeId !== removed.id);
        DB.homeworks = DB.homeworks.filter(h => h.gradeId !== removed.id);
        DB.exams = DB.exams.filter(e => e.gradeId !== removed.id);
        if (removed.current && DB.grades[0]) DB.grades[0].current = true;
      }
      // 星星流水按关联作业级联清理（作业被删/年级被删后失效）
      if (col === 'grades' || col === 'homeworks') {
        DB.checkins = DB.checkins.filter(c => DB.homeworks.some(h => h.id === c.homeworkId));
      }
      if (col === 'courses') DB.homeworks.forEach(h => { if (h.courseId === removed.id) h.courseId = null; });
      persist();
      return sendJSON(res, 200, { ok: true, data: removed });
    }
  }

  // 作业打卡
  if (seg[0] === 'checkin' && method === 'POST' && seg[1]) {
    return readBody(req).then(body => {
      const hw = DB.homeworks.find(h => h.id === seg[1]);
      if (!hw) return sendJSON(res, 404, { ok: false, error: '作业不存在' });
      if (body.cancel) {
        hw.status = 'todo'; hw.checkinAt = null; hw.checkinNote = ''; hw.checkinBy = ''; hw.images = [];
        hw.att = null; hw.meth = null; hw.eff = null; hw.qual = null; hw.quality = null;
        DB.checkins = DB.checkins.filter(c => c.homeworkId !== hw.id);
      } else {
        hw.status = 'done';
        hw.checkinAt = new Date().toISOString();
        hw.checkinNote = body.note || '';
        hw.checkinBy = body.by || '';
        hw.duration = body.duration || null;
        // 完成质量（1~5）；态度/方法/努力已改为「每日评价」单独记录，不再写在单次作业上
        hw.qual = body.qual != null ? Number(body.qual) : (hw.qual || null);
        hw.att = null; hw.meth = null; hw.eff = null; hw.quality = null;
        if (Array.isArray(body.images)) hw.images = body.images;
        // 星星流水：星数 = 完成质量（态度/方法/努力计入每日评价，由 totalStars 合并）
        const stars = Number(hw.qual) || 0;
        DB.checkins = DB.checkins.filter(c => c.homeworkId !== hw.id);
        DB.checkins.push({
          id: uid('c'), homeworkId: hw.id, subject: hw.subject,
          date: hw.checkinAt, by: hw.checkinBy, stars, qual: hw.qual
        });
      }
      persist();
      sendJSON(res, 200, { ok: true, data: hw });
    }).catch(e => sendJSON(res, 400, { ok: false, error: e.message }));
  }

  // 图片上传（base64）
  if (seg[0] === 'upload' && method === 'POST') {
    return readBody(req, 12).then(body => {
      const m = /^data:(image\/(png|jpe?g|webp|gif));base64,(.+)$/i.exec(body.dataUrl || '');
      if (!m) return sendJSON(res, 400, { ok: false, error: '图片格式不支持' });
      const ext = m[2].toLowerCase() === 'jpeg' ? 'jpg' : m[2].toLowerCase();
      const name = uid('img') + '.' + ext;
      fs.writeFileSync(path.join(UPLOAD_DIR, name), Buffer.from(m[3], 'base64'));
      sendJSON(res, 200, { ok: true, url: '/uploads/' + name });
    }).catch(e => sendJSON(res, 400, { ok: false, error: e.message }));
  }

  // 一键载入示例数据（仅当前年级）
  if (seg[0] === 'demo' && method === 'POST') {
    const g = currentGrade();
    if (!g) return sendJSON(res, 400, { ok: false, error: '请先创建年级' });
    seedDemo(g.id);
    migrateGrades();
    persist();
    return sendJSON(res, 200, { ok: true });
  }

  // 清空当前年级数据
  if (seg[0] === 'clear' && method === 'POST') {
    const g = currentGrade();
    if (!g) return sendJSON(res, 400, { ok: false, error: '没有可清空的年级' });
    DB.courses = DB.courses.filter(c => c.gradeId !== g.id);
    DB.packages = DB.packages.filter(p => p.gradeId !== g.id);
    DB.homeworks = DB.homeworks.filter(h => h.gradeId !== g.id);
    DB.exams = DB.exams.filter(e => e.gradeId !== g.id);
    persist();
    return sendJSON(res, 200, { ok: true });
  }

  // 数据导出 / 导入
  if (seg[0] === 'export' && method === 'GET') {
    return sendJSON(res, 200, { ok: true, data: DB });
  }
  if (seg[0] === 'import' && method === 'POST') {
    return readBody(req, 20).then(body => {
      if (!body || !Array.isArray(body.grades)) return sendJSON(res, 400, { ok: false, error: '备份文件格式不正确' });
      persist(true);
      fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `before-import-${Date.now()}.json`));
      DB = body;
      DB.version = APP_VERSION;
      persist(true);
      sendJSON(res, 200, { ok: true });
    }).catch(e => sendJSON(res, 400, { ok: false, error: e.message }));
  }

  return sendJSON(res, 404, { ok: false, error: '接口不存在：' + urlPath });
}

/* ---------------------------- 启动 ---------------------------- */

loadData();

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const query = Object.fromEntries(u.searchParams.entries());

  res.setHeader('X-App-Version', APP_VERSION);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Access-Code'
    });
    return res.end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    if (u.pathname.startsWith('/api/')) return handleAPI(req, res, u.pathname, query);
    return serveStatic(req, res, u.pathname);
  } catch (e) {
    console.error('[服务异常]', e);
    sendJSON(res, 500, { ok: false, error: e.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 星光伴学屋 v${APP_VERSION} 已启动： http://localhost:${PORT}`);
  console.log(`   默认家庭访问码：${DB.family.accessCode}（可在"我的-家庭设置"中修改）`);
});

process.on('SIGTERM', () => { persist(true); process.exit(0); });
process.on('SIGINT', () => { persist(true); process.exit(0); });
