-- 星光伴学屋 · Cloudflare D1 数据库结构
-- 设计原则：与现有 data.json 完全兼容，整份应用状态存为一行 JSON，
-- 不拆表、不重写数据模型，移植风险最低。

-- 单家庭模型：一个家庭 = 一行
CREATE TABLE IF NOT EXISTS households (
  id          TEXT    PRIMARY KEY,   -- 家庭ID，默认 'default'
  data        TEXT    NOT NULL,     -- 整个应用状态 JSON（结构同 data.json：family/grades/courses/packages/homeworks/exams/cards/dailyRatings/settings/changelog...）
  updated_at  INTEGER NOT NULL      -- 最后写入时间戳(ms)，用于实时广播时判断是否需要刷新
);

-- 说明：
-- 1. 读取：SELECT data, updated_at FROM households WHERE id = ?
-- 2. 写入：UPDATE households SET data = ?, updated_at = ? WHERE id = ?
-- 3. 首次：INSERT INTO households(id,data,updated_at) VALUES(?,?,?)（data 用 server 端 defaultData() 生成，与现在 loadData() 逻辑一致）
-- 4. 实时同步（M3）由 Durable Object 负责：Worker 写入后把 updated_at 通过 DO 广播给同家庭所有在线 WebSocket，客户端收到即 loadState() 刷新。

-- 预留：未来若要多家庭隔离，可加 members / invitations 表，当前单家庭模型已满足需求。
