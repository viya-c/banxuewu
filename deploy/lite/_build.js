// 生成「极简部署版」：删 16MB 图片、CSS/JS 内联，仅保留 3 个文件
// 用法：node _build.js  （在 deploy/lite 目录运行）
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', '..');          // /workspace/study-manager
const OUT = __dirname;                                    // /workspace/study-manager/deploy/lite
const PUB = path.join(SRC, 'public');

const read = f => fs.readFileSync(path.join(PUB, f), 'utf8');

const style = read('style.css');
const configJs = read('js/config.js');
const coreJs = read('js/core.js');                        // 单独保留（前端核心逻辑，按需加载）
const features = [
  'js/timetable.js', 'js/today.js', 'js/packages.js',
  'js/exams.js', 'js/settings.js', 'js/app.js'
].map(read).join('\n\n');

// 安全检查：内联 JS 里不能出现 </script>，否则会截断
if ((configJs + features).includes('</script')) {
  throw new Error('内联内容含 </script>，需转义后再构建');
}

let html = read('index.html');
// 1) 内联样式（用函数式替换，避免替换串里的 $ 被特殊解释）
html = html.replace('<link rel="stylesheet" href="/style.css">', () => `<style>\n${style}\n</style>`);
// 2) 去掉 manifest（精简为 3 文件，PWA 安装提示非必需）
html = html.replace('<link rel="manifest" href="/manifest.json">\n', () => '');
// 3) 把 8 个 script 标签替换为：内联 config → 单独 core.js → 内联其余
//    ※ 必须用函数式替换：字符串替换会把 $$ 当成「单个 $」、把 $& 当成「匹配内容」，破坏 JS
const scriptBlock = [
  '<script src="/js/config.js"></script>',
  '<script src="/js/core.js"></script>',
  '<script src="/js/timetable.js"></script>',
  '<script src="/js/today.js"></script>',
  '<script src="/js/packages.js"></script>',
  '<script src="/js/exams.js"></script>',
  '<script src="/js/settings.js"></script>',
  '<script src="/js/app.js"></script>'
].join('\n');
const replacement = `<script>\n${configJs}\n</script>\n<script src="/js/core.js"></script>\n<script>\n${features}\n</script>`;
if (!html.includes(scriptBlock)) throw new Error('未在 index.html 找到脚本块，可能结构已变');
html = html.replace(scriptBlock, () => replacement);

// 写出
fs.mkdirSync(path.join(OUT, 'public', 'js'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'public', 'index.html'), html);
fs.writeFileSync(path.join(OUT, 'public', 'js', 'core.js'), coreJs);   // 前端核心逻辑，单独保留
fs.copyFileSync(path.join(SRC, 'server.js'), path.join(OUT, 'server.js'));

console.log('✅ 极简版生成完成：');
console.log('   deploy/lite/server.js');
console.log('   deploy/lite/public/index.html  (内联 CSS + config + timetable/today/packages/exams/settings/app)');
console.log('   deploy/lite/public/js/core.js  (前端核心逻辑，单独保留)');
console.log('   共 3 个文件，体积:', (fs.statSync(path.join(OUT,'public','index.html')).size/1024).toFixed(0)+'KB(index) +',
  (fs.statSync(path.join(OUT,'server.js')).size/1024).toFixed(0)+'KB(server)');
