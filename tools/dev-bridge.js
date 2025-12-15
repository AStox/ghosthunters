(function() {
  const WS_PORT = 3001;
  
  async function loadGame() {
    try {
      const response = await fetch('/game.pzs');
      if (!response.ok) throw new Error('Failed to fetch game.pzs');
      const code = await response.text();
      
      const textarea = document.getElementById('code');
      const editor = textarea.editorreference;
      
      if (editor) {
        editor.setValue(code);
      } else {
        textarea.value = code;
      }
      
      if (typeof compile === 'function') {
        compile(['restart']);
      }
      
      console.log('[dev-bridge] Game loaded and compiled');
    } catch (err) {
      console.error('[dev-bridge] Error loading game:', err);
    }
  }
  
  function connectWebSocket() {
    const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
    
    ws.onopen = function() {
      console.log('[dev-bridge] WebSocket connected');
    };
    
    ws.onmessage = function(event) {
      if (event.data === 'reload-game') {
        console.log('[dev-bridge] Reloading game...');
        loadGame();
      }
    };
    
    ws.onclose = function() {
      console.log('[dev-bridge] WebSocket closed, reconnecting in 2s...');
      setTimeout(connectWebSocket, 2000);
    };
    
    ws.onerror = function(err) {
      console.error('[dev-bridge] WebSocket error:', err);
    };
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(loadGame, 500);
      connectWebSocket();
    });
  } else {
    setTimeout(loadGame, 500);
    connectWebSocket();
  }
})();
