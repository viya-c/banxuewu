/* ============ 部署配置（可选） ============
 * 本地运行（node server.js）：保持空字符串即可，前端自动走同源接口。
 * 部署到 GitHub Pages + Cloudflare Workers 时：
 *   把下面改成你的 Worker 地址，例如 'https://xingguang.workers.dev'
 *   前端所有 /api 请求与实时同步 WebSocket 都会指向该地址，实现家人之间实时同步。
 */
window.__API_BASE = '';
