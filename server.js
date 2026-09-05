const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');

const server = http.createServer((req, res) => {
  const requested = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const safePath = path.normalize(requested).replace(/^([.][.][\\/])+/, '');
  const file = path.join(publicDir, safePath);
  if (!file.startsWith(publicDir)) return res.writeHead(403).end('Forbidden');
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Not found');
    const type = path.extname(file) === '.js' ? 'text/javascript' : 'text/html; charset=utf-8';
    res.writeHead(200, { 'Content-Type': type }).end(data);
  });
});

const wss = new WebSocketServer({ server });
const rooms = new Map();

wss.on('connection', (socket, request) => {
  let roomCode;
  const connect = (room) => {
    roomCode = String(room || '').trim().toUpperCase().slice(0, 32);
    if (!roomCode) return;
    if (!rooms.has(roomCode)) rooms.set(roomCode, new Set());
    const peers = rooms.get(roomCode);
    if (peers.size >= 2) return socket.send(JSON.stringify({ type: 'room-full' }));
    peers.add(socket);
    socket.send(JSON.stringify({ type: 'joined', initiator: peers.size === 1 }));
    if (peers.size === 2) peers.forEach((peer) => peer.send(JSON.stringify({ type: 'peer-ready' })));
  };
  const signalRoom = request.url.match(/^\/signal\/([A-Za-z0-9_-]{1,32})$/)?.[1];
  if (signalRoom) connect(signalRoom);
  socket.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (message.type === 'join') {
      if (!roomCode) connect(message.room);
      return;
    }
    if (!roomCode || !rooms.has(roomCode)) return;
    rooms.get(roomCode).forEach((peer) => {
      if (peer !== socket && peer.readyState === peer.OPEN) peer.send(JSON.stringify(message));
    });
  });
  socket.on('close', () => {
    if (!roomCode || !rooms.has(roomCode)) return;
    const peers = rooms.get(roomCode);
    peers.delete(socket);
    peers.forEach((peer) => peer.readyState === peer.OPEN && peer.send(JSON.stringify({ type: 'peer-left' })));
    if (!peers.size) rooms.delete(roomCode);
  });
});

server.listen(port, () => console.log(`Vix Voice em http://localhost:${port}`));
