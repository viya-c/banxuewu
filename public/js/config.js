/* ============ 部署配置 ============
 * GitHub 后端模式（仓库当数据库）
 */
window.__GITHUB = {
  owner: 'viya-c',
  repo: 'viya-c.github.io',          // 数据存哪个仓库；如果是这个 Pages 站点仓库本身就填 viya-c.github.io，也可以填别的项目仓库名
  branch: 'main',                     // 确认你的默认分支是 main 还是 master
  dataPath: 'state.json',             // 数据文件，放仓库根目录，会自动创建
  token: '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'
};
