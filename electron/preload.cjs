const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  getHomedir: () => ipcRenderer.invoke('getHomedir'),
  // Write a file from base64 data
  writeFile: (filePath, base64Data) => ipcRenderer.invoke('writeFile', filePath, base64Data),
  // Run a command and get the full output
  exec: (cmd, args) => ipcRenderer.invoke('exec', cmd, args),
  // Run a command and stream output line by line
  execStream: (id, cmd, args) => ipcRenderer.send('exec-stream', id, cmd, args),
  onExecData: (cb) => {
    const handler = (_e, id, type, data) => cb(id, type, data)
    ipcRenderer.on('exec-data', handler)
    return () => ipcRenderer.removeListener('exec-data', handler)
  },
  // Cross-platform file operations
  readFile: (filePath) => ipcRenderer.invoke('readFile', filePath),
  writeFileSafe: (filePath, content) => ipcRenderer.invoke('writeFileSafe', filePath, content),
  fileExists: (filePath) => ipcRenderer.invoke('fileExists', filePath),
  mkdirp: (dirPath) => ipcRenderer.invoke('mkdirp', dirPath),
  removeFile: (filePath) => ipcRenderer.invoke('removeFile', filePath),
  getPlatform: () => ipcRenderer.invoke('getPlatform'),
  refreshPath: () => ipcRenderer.invoke('refreshPath'),
  randomHex: (numBytes) => ipcRenderer.invoke('randomHex', numBytes),
  killPort: (port) => ipcRenderer.invoke('killPort', port),
  isCommandAvailable: (cmd) => ipcRenderer.invoke('isCommandAvailable', cmd),
  getSystemInfo: () => ipcRenderer.invoke('getSystemInfo'),
  getSystemStats: () => ipcRenderer.invoke('getSystemStats'),
  startGatewayDetached: (cmd, args, envVars, logFile) => ipcRenderer.invoke('startGatewayDetached', cmd, args, envVars, logFile),
})
