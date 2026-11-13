// Yolla sinyal sunucusu: kimin çevrimiçi olduğunu tutar ve WebRTC mesajlarını iletir.
// Dosyalar buradan GEÇMEZ. Ortam değişkenleri: KEY (paylaşılan anahtar), PORT
const http = require('http');
const { WebSocketServer } = require('ws');

const KEY = process.env.KEY || '';
const srv = http.createServer((q, r) => { r.writeHead(200); r.end('yolla ok'); });
const wss = new WebSocketServer({ server: srv, maxPayload: 1 << 20 });
const users = new Map();

const list = () => [...users.values()].map(u => ({ id: u.id, name: u.name, av: u.av }));
const broadcast = () => {
  const m = JSON.stringify({ t: 'peers', peers: list() });
  for (const u of users.values()) if (u.ws.readyState === 1) u.ws.send(m);
};

wss.on('connection', (ws, req) => {
  if (KEY && new URL(req.url, 'http://x').searchParams.get('key') !== KEY) return ws.close(4001);
  let me = null;
  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));
  ws.on('message', d => {
    let m; try { m = JSON.parse(d); } catch { return; }
    if (m.t === 'hello' && m.id && m.name) {
      me = { id: String(m.id).slice(0, 64), name: String(m.name).slice(0, 24), av: String(m.av || '').slice(0, 60000), ws };
      const old = users.get(me.id);
      users.set(me.id, me);
      if (old && old.ws !== ws) old.ws.close();
      broadcast();
    } else if (m.t === 'sig' && me) {
      const to = users.get(m.to);
      if (to && to.ws.readyState === 1) to.ws.send(JSON.stringify({ t: 'sig', from: me.id, data: m.data }));
    }
  });
  ws.on('close', () => {
    if (me && users.get(me.id) && users.get(me.id).ws === ws) { users.delete(me.id); broadcast(); }
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false; ws.ping();
  }
}, 25000);

srv.listen(process.env.PORT || 8080);
