const express = require('express');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { WebSocketServer } = require('ws');
const HTTP_PORT = 3000;
const WS_PORT = 3001;

const projectRoot = path.resolve(__dirname, '..');
const puzzlescriptDir = path.join(projectRoot, 'puzzlescript');
const gameFile = path.join(projectRoot, 'game', 'game.pzs');
const bridgeScript = path.join(__dirname, 'dev-bridge.js');

const app = express();

app.get('/game.pzs', (req, res) => {
  res.type('text/plain');
  res.sendFile(gameFile);
});

app.get('/', (req, res) => {
  const editorHtml = fs.readFileSync(path.join(puzzlescriptDir, 'editor.html'), 'utf-8');
  const bridgeJs = fs.readFileSync(bridgeScript, 'utf-8');
  
  const injectedHtml = editorHtml.replace(
    '</body>',
    `<script>\n${bridgeJs}\n</script>\n</body>`
  );
  
  res.type('html');
  res.send(injectedHtml);
});

app.use(express.static(puzzlescriptDir));

const server = app.listen(HTTP_PORT, () => {
  console.log(`[dev-server] HTTP server running at http://localhost:${HTTP_PORT}`);
});

const wss = new WebSocketServer({ port: WS_PORT });

wss.on('listening', () => {
  console.log(`[dev-server] WebSocket server running on port ${WS_PORT}`);
});

wss.on('connection', (ws) => {
  console.log('[dev-server] Browser connected');
});

function broadcastReload() {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send('reload-game');
    }
  });
}

const watcher = chokidar.watch(gameFile, {
  persistent: true,
  ignoreInitial: true,
});

watcher.on('change', (filePath) => {
  console.log(`[dev-server] File changed: ${filePath}`);
  broadcastReload();
});

watcher.on('ready', () => {
  console.log(`[dev-server] Watching ${gameFile} for changes`);
});

setTimeout(async () => {
  const open = (await import('open')).default;
  open(`http://localhost:${HTTP_PORT}`);
}, 500);

process.on('SIGINT', () => {
  console.log('\n[dev-server] Shutting down...');
  watcher.close();
  wss.close();
  server.close();
  process.exit(0);
});
