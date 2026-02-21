try {
  const Sentry = require('@sentry/electron/main')
  Sentry.init({
    dsn: 'https://97bcefa14c7e83c31268119b790427fd@o4510920689319936.ingest.us.sentry.io/4510920749809664',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    environment: process.env.NODE_ENV || 'development',
  })
} catch (e) {
  console.warn('Sentry electron main init skipped:', e.message)
}

const { app, BrowserWindow, shell, ipcMain, powerSaveBlocker } = require('electron')
const path = require('path')
const http = require('http')
const os = require('os')
const fs = require('fs')
const crypto = require('crypto')
const { spawn, execFile } = require('child_process')

const isDev = !app.isPackaged
const isWin = process.platform === 'win32'

// Ensure common paths are in PATH (Electron doesn't inherit shell profile)
const home = os.homedir()

let extraPaths = []
if (isWin) {
  extraPaths = [
    path.join(process.env.APPDATA || '', 'npm'),
    path.join(process.env.ProgramFiles || '', 'nodejs'),
    path.join(process.env.ProgramW6432 || '', 'nodejs'),
    path.join(home, 'AppData', 'Local', 'Programs', 'nodejs'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310'),
    path.join(home, '.volta', 'bin'),
    path.join(home, '.fnm', 'aliases', 'default', 'bin'),
    path.join(home, '.npm-global'),
    path.join(home, 'AppData', 'Local', 'Programs', 'ollama'),
  ]
} else {
  // Discover nvm node paths dynamically
  let nvmPaths = []
  try {
    const nvmDir = `${home}/.nvm/versions/node`
    if (fs.existsSync(nvmDir)) {
      nvmPaths = fs.readdirSync(nvmDir).map(v => `${nvmDir}/${v}/bin`)
    }
  } catch {}

  extraPaths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/share/npm/bin',
    `${home}/.nvm/versions/node/current/bin`,
    ...nvmPaths,
    `${home}/.volta/bin`,
    `${home}/.fnm/aliases/default/bin`,
    `${home}/.npm-global/bin`,
    `${home}/.local/bin`,
  ]
}
process.env.PATH = [...extraPaths, process.env.PATH].join(path.delimiter)

let mainWindow

// IPC: get home directory
ipcMain.handle('getHomedir', () => {
  return require('os').homedir()
})

// IPC: run command and return output
ipcMain.handle('writeFile', async (_event, filePath, base64Data) => {
  const fs = require('fs')
  const path = require('path')
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'))
  return true
})

// IPC: read file as string
ipcMain.handle('readFile', async (_event, filePath) => {
  return fs.readFileSync(filePath, 'utf-8')
})

// IPC: write file with recursive mkdir
ipcMain.handle('writeFileSafe', async (_event, filePath, content) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
  return true
})

// IPC: check if file exists
ipcMain.handle('fileExists', async (_event, filePath) => {
  return fs.existsSync(filePath)
})

// IPC: recursive mkdir
ipcMain.handle('mkdirp', async (_event, dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true })
  return true
})

// IPC: remove file
ipcMain.handle('removeFile', async (_event, filePath) => {
  try { fs.unlinkSync(filePath) } catch {}
  return true
})

// IPC: get platform
ipcMain.handle('getPlatform', () => process.platform)

// IPC: refresh PATH from system (Windows: reads Machine+User PATH, Unix: re-scans common dirs)
ipcMain.handle('refreshPath', () => {
  if (isWin) {
    try {
      const { execSync } = require('child_process')
      const machinePath = execSync('powershell -Command "[Environment]::GetEnvironmentVariable(\'PATH\', \'Machine\')"', { encoding: 'utf8' }).trim()
      const userPath = execSync('powershell -Command "[Environment]::GetEnvironmentVariable(\'PATH\', \'User\')"', { encoding: 'utf8' }).trim()
      process.env.PATH = [machinePath, userPath, ...extraPaths].filter(Boolean).join(path.delimiter)
    } catch {}
  } else {
    process.env.PATH = [...extraPaths, process.env.PATH].join(path.delimiter)
  }
  return process.env.PATH
})

// IPC: random hex bytes
ipcMain.handle('randomHex', (_event, numBytes) => {
  return crypto.randomBytes(numBytes).toString('hex')
})

// IPC: kill process on port (cross-platform)
ipcMain.handle('killPort', async (_event, port) => {
  return new Promise((resolve) => {
    if (isWin) {
      execFile('cmd', ['/c', `for /f "tokens=5" %a in ('netstat -aon ^| findstr :${port} ^| findstr LISTENING') do taskkill /F /PID %a`], { shell: true, timeout: 10000 }, () => resolve(true))
    } else {
      execFile('sh', ['-c', `lsof -ti:${port} | xargs kill -9 2>/dev/null || true`], { timeout: 10000 }, () => resolve(true))
    }
  })
})

// IPC: check if command is available
ipcMain.handle('isCommandAvailable', async (_event, cmd) => {
  return new Promise((resolve) => {
    const checker = isWin ? 'where' : 'which'
    execFile(checker, [cmd], { shell: true, timeout: 5000 }, (err) => {
      resolve(!err)
    })
  })
})

// IPC: get system info (cross-platform)
ipcMain.handle('getSystemInfo', () => {
  return {
    platform: process.platform,
    arch: process.arch,
    totalMem: os.totalmem(),
    cpus: os.cpus().length,
  }
})

// IPC: get system stats (cross-platform)
ipcMain.handle('getSystemStats', () => {
  const cpus = os.cpus()
  let totalIdle = 0, totalTick = 0
  for (const cpu of cpus) {
    for (const type in cpu.times) totalTick += cpu.times[type]
    totalIdle += cpu.times.idle
  }
  const cpuUsage = cpus.length > 0 ? ((1 - totalIdle / totalTick) * 100) : 0
  const memTotal = os.totalmem()
  const memFree = os.freemem()
  const memUsed = memTotal - memFree
  return {
    cpuUsage: Math.round(cpuUsage * 10) / 10,
    memUsed: Math.round(memUsed / (1024 * 1024 * 1024) * 10) / 10,
    memTotal: Math.round(memTotal / (1024 * 1024 * 1024) * 10) / 10,
    uptimeSeconds: Math.floor(os.uptime()),
  }
})

// IPC: start gateway detached (cross-platform)
ipcMain.handle('startGatewayDetached', async (_event, cmd, args, envVars, logFile) => {
  const env = { ...process.env, ...envVars }
  const out = fs.openSync(logFile, 'a')
  const err = fs.openSync(logFile, 'a')
  const child = spawn(cmd, args, {
    env,
    detached: true,
    stdio: ['ignore', out, err],
    shell: isWin,
  })
  child.unref()
  return true
})

ipcMain.handle('exec', (_event, cmd, args, opts) => {
  return new Promise((resolve, reject) => {
    const timeout = (opts && opts.timeout) || 120000
    execFile(cmd, args, { shell: true, timeout, cwd: opts?.cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        // execFile sets err for non-zero exit codes
        // Filter out npm warnings (stderr has warnings but exit code might be from timeout)
        const msg = stderr || err.message || ''
        reject(msg)
      }
      else resolve(stdout.trim())
    })
  })
})

// IPC: run command and stream output
ipcMain.on('exec-stream', (event, id, cmd, args) => {
  const child = spawn(cmd, args, { shell: true })

  const safeSend = (...args) => {
    try { if (!event.sender.isDestroyed()) event.sender.send(...args) } catch {}
  }
  child.stdout?.on('data', (d) => safeSend('exec-data', id, 'output', d.toString()))
  child.stderr?.on('data', (d) => safeSend('exec-data', id, 'error', d.toString()))
  child.on('close', (code) => safeSend('exec-data', id, 'complete', `Process exited with code ${code}`))
  child.on('error', (err) => safeSend('exec-data', id, 'error', err.message))
})

// Serve dist/ via local HTTP in production so renderer has http:// origin
// (avoids gateway rejecting file:// WebSocket connections)
let rendererUrl = null
function startStaticServer() {
  return new Promise((resolve) => {
    if (isDev) { resolve('http://localhost:5173'); return }
    const distPath = path.join(__dirname, '..', 'dist')
    const mimeTypes = {
      '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
      '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff',
      '.woff2': 'font/woff2', '.ttf': 'font/ttf',
    }
    const server = http.createServer((req, res) => {
      let filePath = path.join(distPath, req.url === '/' ? 'index.html' : req.url.split('?')[0])
      // SPA fallback — serve index.html for non-file routes
      if (!fs.existsSync(filePath)) filePath = path.join(distPath, 'index.html')
      const ext = path.extname(filePath)
      const contentType = mimeTypes[ext] || 'application/octet-stream'
      try {
        const data = fs.readFileSync(filePath)
        res.writeHead(200, { 'Content-Type': contentType })
        res.end(data)
      } catch {
        res.writeHead(404)
        res.end('Not found')
      }
    })
    server.listen(0, 'localhost', () => {
      const port = server.address().port
      resolve(`http://localhost:${port}`)
    })
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0d1117',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: false,
      webviewTag: true,
    },
  })

  mainWindow.loadURL(rendererUrl)
  // Always enable DevTools shortcut (Cmd+Option+I)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.meta && input.alt && input.key === 'i') {
      mainWindow.webContents.toggleDevTools()
    }
  })
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  rendererUrl = await startStaticServer()
  createWindow()

  // Prevent display from sleeping while app is running
  const blockerId = powerSaveBlocker.start('prevent-display-sleep')
  app.on('will-quit', () => {
    if (powerSaveBlocker.isStarted(blockerId)) powerSaveBlocker.stop(blockerId)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (!rendererUrl) rendererUrl = await startStaticServer()
    createWindow()
  }
})
