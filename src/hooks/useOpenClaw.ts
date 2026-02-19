import { useState, useEffect, useCallback } from 'react';

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      isElectron: boolean;
      getHomedir: () => Promise<string>;
      writeFile: (filePath: string, base64Data: string) => Promise<boolean>;
      exec: (cmd: string, args: string[], opts?: { timeout?: number; cwd?: string }) => Promise<string>;
      refreshPath: () => Promise<string>;
      execStream: (id: string, cmd: string, args: string[]) => void;
      onExecData: (cb: (id: string, type: string, data: string) => void) => () => void;
      readFile: (filePath: string) => Promise<string>;
      writeFileSafe: (filePath: string, content: string) => Promise<boolean>;
      fileExists: (filePath: string) => Promise<boolean>;
      mkdirp: (dirPath: string) => Promise<boolean>;
      removeFile: (filePath: string) => Promise<boolean>;
      getPlatform: () => Promise<string>;
      randomHex: (numBytes: number) => Promise<string>;
      killPort: (port: number) => Promise<boolean>;
      isCommandAvailable: (cmd: string) => Promise<boolean>;
      getSystemInfo: () => Promise<{ platform: string; arch: string; totalMem: number; cpus: number }>;
      getSystemStats: () => Promise<{ cpuUsage: number; memUsed: number; memTotal: number; uptimeSeconds: number }>;
      startGatewayDetached: (cmd: string, args: string[], envVars: Record<string, string>, logFile: string) => Promise<boolean>;
    };
  }
}

export interface OpenClawStatus {
  installed: boolean;
  version: string | null;
  gateway: 'running' | 'stopped' | 'idle';
  localUrl: string;
}

export interface TerminalLine {
  type: 'output' | 'error' | 'complete';
  data: string;
  command: string;
}

const isElectron = !!window.electronAPI?.isElectron;
const LOCAL_API = window.location.protocol === 'file:' ? 'http://localhost:3001' : '';

export function useOpenClaw() {
  const [status, setStatus] = useState<OpenClawStatus | null>(null);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [loading, setLoading] = useState(true);

  // Electron IPC-based status check
  const fetchStatusElectron = useCallback(async () => {
    const api = window.electronAPI!;
    let installed = false;
    let version: string | null = null;
    let gateway: 'running' | 'stopped' | 'idle' = 'stopped';
    let localUrl = 'http://127.0.0.1:18789';

    try {
      await api.exec('which', ['openclaw']);
      installed = true;
    } catch { /* not installed */ }

    if (installed) {
      try {
        version = await api.exec('openclaw', ['--version']);
      } catch { /* ignore */ }

      try {
        const s = await api.exec('openclaw', ['gateway', 'status']);
        const lower = s.toLowerCase();
        if (lower.includes('running')) gateway = 'running';
        else if (lower.includes('idle')) gateway = 'idle';
        else gateway = 'stopped';
        const urlMatch = s.match(/https?:\/\/[^\s]+/);
        if (urlMatch) localUrl = urlMatch[0];
      } catch { /* ignore */ }
    }

    setStatus({ installed, version, gateway, localUrl });
    setLoading(false);
  }, []);

  // HTTP-based status check (dev mode with local server)
  const fetchStatusHTTP = useCallback(async () => {
    try {
      const res = await fetch(`${LOCAL_API}/api/status`);
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ installed: false, version: null, gateway: 'stopped', localUrl: '' });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStatus = isElectron ? fetchStatusElectron : fetchStatusHTTP;

  // Stream command via Electron IPC
  const streamElectron = useCallback((command: string, cmd: string, args: string[]) => {
    const api = window.electronAPI!;
    const id = `${command}-${Date.now()}`;
    api.execStream(id, cmd, args);
  }, []);

  // Stream command via HTTP (dev mode)
  const streamHTTP = useCallback(async (method: string, path: string) => {
    try {
      await fetch(`${LOCAL_API}${path}`, { method });
    } catch (err: any) {
      setLines(prev => [...prev, { type: 'error', data: `Request failed: ${err.message}`, command: 'api' }]);
    }
  }, []);

  // Listen for Electron IPC stream data
  useEffect(() => {
    if (!isElectron) return;
    const cleanup = window.electronAPI!.onExecData((id, type, data) => {
      setLines(prev => [...prev, { type: type as any, data, command: id }]);
      if (type === 'complete') fetchStatus();
    });
    return cleanup;
  }, [fetchStatus]);

  // Connect WebSocket for dev mode streaming
  useEffect(() => {
    if (isElectron) return;
    const wsBase = window.location.protocol === 'file:'
      ? 'ws://localhost:3001'
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
    const ws = new WebSocket(`${wsBase}/ws`);
    ws.onmessage = (e) => {
      try {
        const msg: TerminalLine = JSON.parse(e.data);
        setLines(prev => [...prev, msg]);
        if (msg.type === 'complete') fetchStatus();
      } catch { /* ignore */ }
    };
    return () => ws.close();
  }, [fetchStatus]);

  // Poll status
  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const install = isElectron
    ? () => streamElectron('install', 'rm -rf ~/.openclaw && npm uninstall -g openclaw 2>/dev/null; curl -fsSL https://openclaw.ai/install.sh | bash', [])
    : () => streamHTTP('POST', '/api/install');

  const onboard = isElectron
    ? () => streamElectron('onboard', 'openclaw', ['onboard'])
    : () => streamHTTP('POST', '/api/onboard');

  const gatewayStart = isElectron
    ? () => streamElectron('gateway-start', 'openclaw', ['gateway', 'start'])
    : () => streamHTTP('POST', '/api/gateway/start');

  const gatewayStop = isElectron
    ? () => streamElectron('gateway-stop', 'openclaw', ['gateway', 'stop'])
    : () => streamHTTP('POST', '/api/gateway/stop');

  const gatewayRestart = isElectron
    ? () => streamElectron('gateway-restart', 'openclaw', ['gateway', 'restart'])
    : () => streamHTTP('POST', '/api/gateway/restart');

  const uninstall = isElectron
    ? () => streamElectron('uninstall', 'npm', ['uninstall', '-g', 'openclaw'])
    : () => streamHTTP('POST', '/api/uninstall');

  const clearTerminal = () => setLines([]);

  const changeModel = async (model: string) => {
    if (isElectron) {
      try {
        await window.electronAPI!.exec('openclaw', ['config', 'set', 'model', model]);
      } catch (err: any) {
        setLines(prev => [...prev, { type: 'error', data: `Failed to change model: ${err.message}`, command: 'change-model' }]);
      }
    } else {
      try {
        await fetch(`${LOCAL_API}/api/model`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) });
      } catch (err: any) {
        setLines(prev => [...prev, { type: 'error', data: `Failed to change model: ${err.message}`, command: 'change-model' }]);
      }
    }
  };

  const getCurrentModel = async (): Promise<string | null> => {
    if (isElectron) {
      try {
        return await window.electronAPI!.exec('openclaw', ['config', 'get', 'model']);
      } catch { return null; }
    } else {
      try {
        const res = await fetch(`${LOCAL_API}/api/model`);
        const data = await res.json();
        return data.model;
      } catch { return null; }
    }
  };

  const changeChannel = async (channel: string, config: Record<string, string>) => {
    if (isElectron) {
      // TODO: implement via CLI
      setLines(prev => [...prev, { type: 'error', data: 'Channel config not yet supported in Electron mode', command: 'change-channel' }]);
    } else {
      try {
        await fetch(`${LOCAL_API}/api/channel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, config }) });
      } catch (err: any) {
        setLines(prev => [...prev, { type: 'error', data: `Failed to change channel: ${err.message}`, command: 'change-channel' }]);
      }
    }
  };

  const hasConfig = status?.installed && status?.version;

  return {
    status, loading, lines, hasConfig,
    install, onboard, gatewayStart, gatewayStop, gatewayRestart, uninstall, clearTerminal, fetchStatus,
    changeModel, getCurrentModel, changeChannel,
  };
}
