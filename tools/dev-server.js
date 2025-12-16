const express = require('express');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
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

// Level editor route
app.get('/editor', (req, res) => {
  res.sendFile(path.join(projectRoot, 'editor.html'));
});

// Serve game folder for editor
app.use('/game', express.static(path.join(projectRoot, 'game')));

// Temp file for edited game
const tempGameFile = path.join(projectRoot, 'game', 'game.temp.pzs');

// Save temp game data for playing edited version
app.use(express.json({ limit: '1mb' }));

app.post('/api/save-temp', (req, res) => {
  const { source } = req.body;
  if (!source) {
    return res.status(400).json({ error: 'No source provided' });
  }
  
  try {
    fs.writeFileSync(tempGameFile, source, 'utf8');
    console.log(`[dev-server] Saved temp game file`);
    res.json({ success: true });
  } catch (err) {
    console.error(`[dev-server] Save temp error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// Save to real game file
app.post('/api/save', (req, res) => {
  const { source } = req.body;
  if (!source) {
    return res.status(400).json({ error: 'No source provided' });
  }
  
  try {
    fs.writeFileSync(gameFile, source, 'utf8');
    console.log(`[dev-server] Saved game file`);
    res.json({ success: true });
  } catch (err) {
    console.error(`[dev-server] Save error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// Play endpoint - runs npm run play for a specific level using temp file
app.post('/api/play/:level', (req, res) => {
  const level = parseInt(req.params.level, 10);
  if (isNaN(level) || level < 1) {
    return res.status(400).json({ error: 'Invalid level number' });
  }
  
  // Check if temp file exists, use it; otherwise use original
  const sourceFile = fs.existsSync(tempGameFile) ? tempGameFile : gameFile;
  
  console.log(`[dev-server] Playing level ${level} from ${path.basename(sourceFile)}`);
  
  // We need to modify export-html.js call to use our temp file
  // For now, copy temp to original location temporarily
  const exportScript = path.join(__dirname, 'export-html.js');
  
  // Build the game with the temp/current source
  const child = spawn('node', [exportScript, `--level=${level}`, `--source=${sourceFile}`], {
    cwd: projectRoot,
    stdio: 'inherit'
  });
  
  child.on('close', (code) => {
    if (code === 0) {
      // Open the game
      import('open').then(m => {
        m.default(path.join(projectRoot, 'dist', 'game.html'));
      });
    }
  });
  
  child.on('error', (err) => {
    console.error(`[dev-server] Play error:`, err);
  });
  
  res.json({ success: true, level });
});

// Cleanup temp file on exit
process.on('exit', () => {
  if (fs.existsSync(tempGameFile)) {
    fs.unlinkSync(tempGameFile);
  }
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
