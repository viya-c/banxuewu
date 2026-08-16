# 星光伴学屋 · GitHub + Cloudflare 永久免费部署指南（支持一键更新）

> 目标：家人各用手机/电脑打开**同一个网址**，数据实时同步共享。
> 架构：前端静态页 → **GitHub Pages**（永久免费、不休眠）；后端 API + 实时同步 → **Cloudflare Workers / D1 / Durable Objects**（永久免费、不休眠）。
> 更新方式：改完代码 **`git push`** → GitHub Actions **自动**把前端部署到 Pages、把后端部署到 Cloudflare。以后更新零额外操作。

---

## 〇、方案要点（为什么选它）

| 项 | 说明 |
|---|---|
| 永久免费 | GitHub Pages 免费且**永不休眠**；Cloudflare Workers/D1 免费档也**永不休眠**（按请求计费，家庭用量几乎为 0） |
| 后续能更新 | 仓库里已配好两个 GitHub Actions 工作流：push 到 main 即自动部署前后端 |
| 实时同步 | 后端 Worker + Durable Object 做 WebSocket 广播（M3/M4 已就绪）；家人一端改，其它在线端秒级刷新 |
| 首次需电脑 | 一次性把代码推上 GitHub + 在 Cloudflare 建库；之后更新可在 GitHub 网页改文件，手机也行 |

---

## 一、一次性准备（约 15 分钟）

### 1.1 前置
- 一个 GitHub 账号、一个 Cloudflare 账号（均免费，Cloudflare 无需绑卡）
- 一台能连 GitHub 的电脑（装 Git；[Node.js](https://nodejs.org/) 可选——下面提供「免装 wrangler」建库法）

### 1.2 把代码推上 GitHub
> 本仓库代码已在沙箱准备就绪（含 `public/`、`deploy/cloudflare/worker.js`、`wrangler.toml`、`.github/workflows/` 等）。
> 沙箱连不上 GitHub，所以由你在能连的机器上执行：

```bash
# 进入项目目录
cd 星光伴学屋项目路径
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```
（密码处用 **Personal Access Token**，不是账号密码；GitHub → Settings → Developer settings → Tokens 生成，勾 `repo`）

### 1.3 在 Cloudflare 建数据库（免装 wrangler，网页操作）
1. 登录 dash.cloudflare.com → 左侧 **Workers & Pages** → **D1**
2. **Create** → 名称填 `xingguang` → 创建
3. 进入该库 → **Console** 标签，粘贴下面 SQL 执行（建表，只需一次）：
   ```sql
   CREATE TABLE IF NOT EXISTS households (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
   ```
4. 在库首页复制 **database_id**（一长串）

### 1.4 把 database_id 填进配置
打开 `deploy/cloudflare/wrangler.toml`，把：
```toml
database_id = "REPLACE_WITH_D1_ID"
```
改成你刚复制的 id（保留引号），提交：
```bash
git add deploy/cloudflare/wrangler.toml
git commit -m "填入 D1 database_id"
git push
```

### 1.5 在 GitHub 配置 Cloudflare 密钥（让 Actions 能部署 Worker）
1. Cloudflare → 右上角头像 → **My Profile → API Tokens → Create Token**
2. 选 **Edit Cloudflare Workers** 模板（或自定义：含 `Account > D1 > Edit`、`Workers Scripts > Edit`）
3. 生成后**复制 Token**
4. GitHub 仓库 → **Settings → Secrets and variables → Actions → New repository secret**，添加两条：
   - `CLOUDFLARE_API_TOKEN` = 刚复制的 Token
   - `CLOUDFLARE_ACCOUNT_ID` = 你的账户 ID（Cloudflare 右下角或 `wrangler whoami` 可见）

### 1.6 开启 GitHub Pages（源 = GitHub Actions）
仓库 → **Settings → Pages** → **Build and deployment → Source** 选 **GitHub Actions**。
（此时 push 会触发 `pages.yml` 自动部署 `public/`）

### 1.7 前端指向 Worker，触发首次自动部署
1. 编辑 `public/js/config.js`：
   ```js
   window.__API_BASE = 'https://xingguang-banxuewu.<你的workers子域>.workers.dev';
   ```
   > Worker 子域在首次 `wrangler deploy` 后可见；若还没部署过，可先部署一次（见下）或填占位、等部署成功后改。
2. 提交并推送：
   ```bash
   git add public/js/config.js
   git commit -m "配置 Worker 地址"
   git push
   ```
3. 这次 push 会**同时触发两个工作流**：`pages.yml`（部署前端）+ `deploy-worker.yml`（部署后端）。
   在仓库 **Actions** 标签看进度，均变绿即成功。Worker 地址在 Cloudflare → Workers & Pages 里查看。

### 1.8 验证
打开 Pages 网址（`https://<用户名>.github.io/<仓库名>/`）→ 访问码 `2026` → 选身份进入。
用两台设备都登录，一端打卡/加作业，另一端**秒级自动刷新**即成功。

---

## 二、后续怎么更新（核心卖点）

改完代码后，只需**推一次**就会自动部署前后端：

```bash
git add -A
git commit -m "改了什么"
git push          # ← 自动触发 Pages + Worker 部署，无需手动操作
```

- **改前端**（`public/` 下任意文件）：`pages.yml` 自动更新 GitHub Pages。
- **改后端**（`deploy/cloudflare/` 下逻辑）：`deploy-worker.yml` 自动 `wrangler deploy`。
- **手机也能更新**：在 GitHub 网页打开文件 → 编辑 → Commit，同样触发自动部署（不用电脑、不用装 Git）。
- 部署通常 1～2 分钟生效，可在仓库 **Actions** 看状态。

> 备注：Worker 地址（`xingguang-banxuewu.<子域>.workers.dev`）一旦部署就固定，所以 `config.js` 的 `__API_BASE` 一般不用再改；只有换 Worker 名时才改。

---

## 三、排错

| 现象 | 排查 |
|---|---|
| `deploy-worker.yml` 红（部署失败） | 看 Actions 日志：多半是 `CLOUDFLARE_API_TOKEN` 权限不足或 `database_id` 没填对；Token 需含 D1/Workers 编辑权 |
| Pages 打开读不到数据 | `public/js/config.js` 的 `__API_BASE` 没填或填错；确认 Worker 已部署可达 |
| Worker 部署报「D1 不存在」 | 1.3 建库后把 id 填进 wrangler.toml 并 push 了；或数据库名不是 `xingguang` |
| 家人不实时刷新 | 对方设备需保持打开且联网；断网走「回前台刷新」兜底 |
| 国内个别地区慢 | Cloudflare 一般可用；后续可在 Cloudflare 绑定自定义域名（DNS 托管过去）提速 |

---

## 四、文件清单

| 文件 | 作用 |
|---|---|
| `public/` | 前端静态页（index.html / style.css / js） |
| `public/js/config.js` | **部署时改这里**：填 Worker 地址 |
| `deploy/cloudflare/worker.js` | Worker 入口：转发 `/api/*` 到 D1，转发 `/api/ws` 到 Durable Object |
| `deploy/cloudflare/logic.js` | 业务逻辑（与本地 server.js 一致） |
| `deploy/cloudflare/realtime.js` | 实时同步 Durable Object（WebSocket 广播） |
| `deploy/cloudflare/schema.sql` | D1 建表语句 |
| `deploy/cloudflare/wrangler.toml` | Worker 部署配置（D1 / DO 绑定；填 database_id） |
| `.github/workflows/pages.yml` | **自动部署前端到 GitHub Pages**（push 触发） |
| `.github/workflows/deploy-worker.yml` | **自动部署后端到 Cloudflare**（push 触发，用 Secrets） |
| `deploy/lite/` | 备选：极简 3 文件版（用于纯手机上传到 Render/Koyeb 等，见其 README） |
| `DEPLOY.md` | 本指南 |
