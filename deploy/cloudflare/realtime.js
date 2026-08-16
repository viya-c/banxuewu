// 星光伴学屋 · 实时同步 Durable Object
// 每个家庭一个 DO 实例，持有该家庭所有在线 WebSocket；Worker 写入后调用 /notify 广播，
// 各端收到即重新 loadState()，实现家人之间秒级同步。
export class Realtime {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();   // 当前在线的 WebSocket 连接
  }

  async fetch(request) {
    const url = new URL(request.url);

    // 1) WebSocket 握手：浏览器前端连接进来
    if (request.headers.get('upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const server = pair[1];
      const client = pair[0];
      server.accept();
      this.sessions.add(server);
      server.addEventListener('message', () => { /* 心跳/忽略，前端不必发消息 */ });
      server.addEventListener('close', () => this.sessions.delete(server));
      server.addEventListener('error', () => this.sessions.delete(server));
      return new Response(null, {
        status: 101,
        webSocket: client,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 2) 广播：Worker 在 commit() 后调用，把 updatedAt 推给所有在线端
    if (request.method === 'POST' && url.pathname === '/notify') {
      const body = await request.json().catch(() => ({}));
      const msg = JSON.stringify({ type: 'sync', updatedAt: body.updatedAt });
      for (const ws of this.sessions) {
        try { ws.send(msg); } catch { this.sessions.delete(ws); }
      }
      return new Response('ok');
    }

    return new Response('bad request', { status: 400 });
  }
}
