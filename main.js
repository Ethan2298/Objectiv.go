const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Backend server process
let serverProcess = null;

// Load .env file if it exists
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) {
      process.env[key.trim()] = vals.join('=').trim();
    }
  });
}

// Load Doppler secrets if available
const dopplerSecretsPath = path.join(__dirname, 'doppler-secrets.js');
if (fs.existsSync(dopplerSecretsPath)) {
  try {
    const content = fs.readFileSync(dopplerSecretsPath, 'utf-8');
    const match = content.match(/ANTHROPIC_API_KEY["']?\s*:\s*["']([^"']+)["']/);
    if (match && match[1]) {
      process.env.ANTHROPIC_API_KEY = match[1];
      console.log('🔑 ANTHROPIC_API_KEY loaded from Doppler secrets');
    }
  } catch (err) {
    console.warn('Failed to load Doppler secrets:', err.message);
  }
}

// Groq API configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = 'llama-3.1-8b-instant';

// Start the backend agent server
function startAgentServer() {
  const serverPath = path.join(__dirname, 'server', 'index.mjs');

  // Check if server file exists
  if (!fs.existsSync(serverPath)) {
    console.log('⚠️ Agent server not found at', serverPath);
    return;
  }

  console.log('🚀 Starting agent server...');

  // Spawn the server process with current environment
  serverProcess = spawn('node', [serverPath], {
    cwd: __dirname,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`[Agent Server] ${data.toString().trim()}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[Agent Server Error] ${data.toString().trim()}`);
  });

  serverProcess.on('close', (code) => {
    console.log(`[Agent Server] Process exited with code ${code}`);
    serverProcess = null;
  });

  serverProcess.on('error', (err) => {
    console.error('[Agent Server] Failed to start:', err.message);
    serverProcess = null;
  });
}

// Stop the backend agent server
function stopAgentServer() {
  if (serverProcess) {
    console.log('🛑 Stopping agent server...');
    serverProcess.kill();
    serverProcess = null;
  }
}

console.log('🔑 GROQ_API_KEY:', GROQ_API_KEY ? 'SET (' + GROQ_API_KEY.slice(0, 8) + '...)' : 'NOT SET');

// Calculate clarity using Groq LLM
async function calculateClarityWithLLM(name, description) {
  if (!GROQ_API_KEY) {
    return { error: 'GROQ_API_KEY not set', score: null };
  }

  if (!name || !name.trim()) {
    return { score: 0, label: 'fuzzy' };
  }

  // Build the content to evaluate
  let content = `Title: ${name}`;
  if (description && description.trim()) {
    content += `\nDescription: ${description}`;
  }

  try {
    console.log('🤖 Calling Groq API...');
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: `You evaluate how clear and actionable an objective/goal is based on its title and description.
Rate from 0-100 where:
- 0-30: Fuzzy (vague, no clear outcome or action)
- 31-60: Forming (some clarity but missing specifics)
- 61-100: Clear (specific, measurable, actionable)
Respond with ONLY a number 0-100, nothing else.`
          },
          {
            role: 'user',
            content: content
          }
        ],
        temperature: 0,
        max_tokens: 10
      })
    });

    const data = await response.json();
    const scoreText = data.choices?.[0]?.message?.content?.trim();
    console.log('📊 Groq response:', scoreText);
    const score = parseInt(scoreText, 10);

    if (isNaN(score) || score < 0 || score > 100) {
      return { score: 50, label: 'forming', raw: scoreText };
    }

    const label = score <= 30 ? 'fuzzy' : score <= 60 ? 'forming' : 'clear';
    return { score, label };
  } catch (err) {
    return { error: err.message, score: null };
  }
}

function createWindow() {
  const isMac = process.platform === 'darwin';
  const iconFile = isMac ? 'icon.icns' : 'icon.ico';

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#000000',
    icon: path.join(__dirname, iconFile),
    frame: isMac ? true : false,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    trafficLightPosition: isMac ? { x: 12, y: 11 } : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile('index.html');

  // Handle webview new window requests (target="_blank" links, window.open, etc.)
  win.webContents.on('did-attach-webview', (event, webviewWebContents) => {
    webviewWebContents.setWindowOpenHandler(({ url }) => {
      // Send URL to renderer to open in a new tab
      win.webContents.send('open-url-in-new-tab', url);
      return { action: 'deny' }; // Prevent default new window
    });
  });

  // Fullscreen events - notify renderer to adjust UI
  win.on('enter-full-screen', () => {
    win.webContents.send('fullscreen-change', true);
  });
  win.on('leave-full-screen', () => {
    win.webContents.send('fullscreen-change', false);
  });

  // Window control handlers
  ipcMain.on('window-minimize', () => win.minimize());
  ipcMain.on('window-maximize', () => {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });
  ipcMain.on('window-close', () => win.close());

  // Clarity scoring with LLM
  ipcMain.handle('calculate-clarity', async (event, name, description) => {
    return await calculateClarityWithLLM(name, description);
  });

  // ========================================
  // Folder Explorer - Filesystem Handlers
  // ========================================

  // Open folder picker dialog
  ipcMain.handle('folder-explorer:pick-folder', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Select Folder to Explore'
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // Read directory contents
  ipcMain.handle('folder-explorer:read-dir', async (event, dirPath) => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      // File extensions to hide from directory listing
      const hiddenExtensions = ['.jxr'];
      const items = entries
        .filter(entry => !entry.name.startsWith('.')) // Hide dotfiles
        .filter(entry => {
          if (entry.isDirectory()) return true;
          const ext = path.extname(entry.name).toLowerCase();
          return !hiddenExtensions.includes(ext);
        })
        .map(entry => ({
          name: entry.name,
          path: path.join(dirPath, entry.name),
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile()
        }))
        .sort((a, b) => {
          // Directories first, then files, alphabetically
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
      return { success: true, items };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Get home directory
  ipcMain.handle('folder-explorer:get-home', () => {
    return os.homedir();
  });

  // Check if path exists
  ipcMain.handle('folder-explorer:exists', async (event, filePath) => {
    return fs.existsSync(filePath);
  });

  // Get path info
  ipcMain.handle('folder-explorer:get-info', async (event, filePath) => {
    try {
      const stats = fs.statSync(filePath);
      return {
        success: true,
        info: {
          path: filePath,
          name: path.basename(filePath),
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
          size: stats.size,
          modified: stats.mtime
        }
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Read file contents
  ipcMain.handle('folder-explorer:read-file', async (event, filePath) => {
    try {
      const ext = path.extname(filePath).toLowerCase().slice(1);
      const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'];
      const excelExtensions = ['xlsx', 'xls', 'xlsm', 'xlsb'];

      if (imageExtensions.includes(ext)) {
        // Read image as base64
        const buffer = fs.readFileSync(filePath);
        const base64 = buffer.toString('base64');
        const mimeTypes = {
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'gif': 'image/gif',
          'webp': 'image/webp',
          'svg': 'image/svg+xml',
          'bmp': 'image/bmp',
          'ico': 'image/x-icon',
          'avif': 'image/avif'
        };
        return {
          success: true,
          content: base64,
          mimeType: mimeTypes[ext] || 'image/png',
          isImage: true
        };
      }

      if (excelExtensions.includes(ext)) {
        // Read Excel as base64 binary
        const buffer = fs.readFileSync(filePath);
        const base64 = buffer.toString('base64');
        return {
          success: true,
          content: base64,
          isExcel: true,
          fileName: path.basename(filePath)
        };
      }

      // Read as text (includes CSV which is text-based)
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Write file contents
  ipcMain.handle('folder-explorer:write-file', async (event, filePath, content) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Delete file
  ipcMain.handle('folder-explorer:delete-file', async (event, filePath) => {
    try {
      fs.unlinkSync(filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Rename/move file
  ipcMain.handle('folder-explorer:rename-file', async (event, oldPath, newPath) => {
    try {
      fs.renameSync(oldPath, newPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Create directory (recursive)
  ipcMain.handle('folder-explorer:mkdir', async (event, dirPath) => {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

app.whenReady().then(() => {
  // Set dock icon on Mac
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(path.join(__dirname, 'icon.png'));
  }
  startAgentServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  stopAgentServer();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
