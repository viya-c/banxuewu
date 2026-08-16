/* ============ 部署配置（可选） ============
 * 本地运行（node server.js）：保持空字符串即可，前端自动走同源接口。
 * 部署到 GitHub Pages + Cloudflare Workers 时：
 *   把下面改成你的 Worker 地址，例如 'https://xingguang.workers.dev'
 *   前端所有 /api 请求与实时同步 WebSocket 都会指向该地址，实现家人之间实时同步。
 */
window.__GITHUB = {
  owner: '你的GitHub用户名',          // 例如网址 github.com/小明/xingguang 里的「小明」
  repo: 'xingguang',                // 仓库名，一般就是这个
  branch: 'main',                   // 默认分支
  dataPath: 'data/state.json',       // 不用改
  token: 'github_pat_这里粘贴你刚复制的token'
};
