# 星光伴学屋 · 手机端部署包（极简 3 文件）

本目录是**去掉 16MB 图片、CSS/JS 内联**后的极简部署版，共 4 个文件：
- `package.json`          —— 启动配置（让托管平台自动识别 `node server.js`，无需手填命令）
- `server.js`             —— 后端（零依赖 Node，监听 `$PORT`，绑 0.0.0.0）
- `public/index.html`     —— 前端（已内联 CSS + 其余 JS）
- `public/js/core.js`     —— 前端核心（单独保留以便按需加载）

> 已用浏览器冒烟验证：登录正常、0 报错、示例数据正常生成。

---

## 手机端完整部署步骤（不装任何软件）

### A. GitHub 建仓库（手机浏览器）
1. github.com → 右上角「＋」→ **New repository**
2. 名字 `xingguang`，选 **Public**，不要勾 README/.gitignore → **Create repository**

### B. 上传这 3 个文件（手机浏览器）
对本目录 3 个文件，逐个操作：仓库页点 **Add file → Create new file**，
在「Name your file…」里填**完整路径**，把文件内容粘贴进去，点 **Commit changes**。

| 文件路径（务必照填） | 内容来源 |
|---|---|
| `server.js` | 本目录 `server.js` |
| `public/index.html` | 本目录 `public/index.html`（输入 `public/index.html` 会自动建文件夹） |
| `public/js/core.js` | 本目录 `public/js/core.js` |

> 提示：手机上打开对应文件 → 全选复制 → 粘贴到 GitHub。三个文件都传完即可。

### C. 平台部署（手机浏览器，3 步）
选一个**免费、通常不绑卡**的平台（如 **Koyeb** / **Glitch**；Render 免费档可能需绑卡，可跳过）：

1. 打开平台官网 → 点 **Continue with GitHub** 登录并授权
2. **New / Create** → 选 **Deploy from GitHub** → 选刚建的 `xingguang` 仓库
3. 填两项（其余默认）：
   - **Build Command（构建命令）**：**留空**（零依赖，不用装包）
   - **Start Command（启动命令）**：`node server.js`
   → 点 **Deploy** → 等 1～2 分钟 → 平台给一个网址

家人手机浏览器打开该网址 → 访问码 `2026` → 选身份进入，即可全家共享同一份数据。

---

## 说明
- **免费档可能闲置休眠**：首次打开慢几秒（冷启动）；要「永不睡」需升级付费档（很便宜）。
- **数据存在平台**：换平台/删除服务会丢数据，重要时可在「我的 → 数据备份」导出 JSON 留存。
- **重新生成此包**：在沙箱跑 `node _build.js`（会重新内联最新代码）。
- **实时同步**：当前为「切回前台/重新打开自动刷新」；要秒级推送需后端加 SSE（可后续增强）。
