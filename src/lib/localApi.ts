// Local API — uses Electron IPC when available, falls back to Express server in dev

const isElectron = !!window.electronAPI?.isElectron;

export const LOCAL_API = isElectron ? '' : (window.location.protocol === 'file:' ? 'http://localhost:3001' : '');

// Execute a command and return stdout
async function exec(cmd: string, args: string[]): Promise<string> {
  if (isElectron) {
    return window.electronAPI!.exec(cmd, args);
  }
  throw new Error('Not in Electron');
}

// Read a file from the filesystem
async function readFile(path: string): Promise<string> {
  if (isElectron) {
    return window.electronAPI!.exec('cat', [path]);
  }
  throw new Error('Not in Electron');
}

// Get home directory (cached)
let _homedir = '';
async function getHomedir(): Promise<string> {
  if (!_homedir && isElectron) {
    _homedir = await window.electronAPI!.getHomedir();
  }
  return _homedir;
}

// Get OpenClaw gateway auth (url + token)
async function getGatewayAuth(): Promise<{ url: string; token: string }> {
  const homedir = await getHomedir();
  try {
    const configRaw = await readFile(`${homedir}/.openclaw/openclaw.json`);
    const config = JSON.parse(configRaw);
    const token = config?.gateway?.auth?.token || config?.gateway?.token || config?.auth?.gatewayToken || '';
    const port = config?.gateway?.port || 18789;
    return { url: `http://127.0.0.1:${port}`, token };
  } catch {
    return { url: 'http://127.0.0.1:18789', token: '' };
  }
}

// ---- API functions ----

export async function fetchStatus(): Promise<{
  installed: boolean; version: string | null;
  gateway: 'running' | 'stopped' | 'idle'; localUrl: string;
}> {
  if (!isElectron) {
    const res = await fetch(`${LOCAL_API}/api/status`);
    return res.json();
  }
  let installed = false, version: string | null = null;
  let gateway: 'running' | 'stopped' | 'idle' = 'stopped';
  let localUrl = 'http://127.0.0.1:18789';

  try { await exec('which', ['openclaw']); installed = true; } catch {}
  if (installed) {
    try { version = await exec('openclaw', ['--version']); } catch {}
    try {
      const s = await exec('openclaw', ['gateway', 'status']);
      const lower = s.toLowerCase();
      if (lower.includes('running')) gateway = 'running';
      else if (lower.includes('idle')) gateway = 'idle';
      const m = s.match(/https?:\/\/[^\s]+/);
      if (m) localUrl = m[0];
    } catch {}
  }
  return { installed, version, gateway, localUrl };
}

export async function fetchConfig(): Promise<{ ok: boolean; config: any }> {
  if (!isElectron) {
    const res = await fetch(`${LOCAL_API}/api/config`);
    return res.json();
  }
  try {
    const homedir = await getHomedir();
    const raw = await readFile(`${homedir}/.openclaw/openclaw.json`);
    return { ok: true, config: JSON.parse(raw) };
  } catch (err: any) {
    return { ok: false, config: null };
  }
}

export async function fetchTasks(): Promise<{ ok: boolean; tasks: any[] }> {
  if (!isElectron) {
    const res = await fetch(`${LOCAL_API}/api/tasks`);
    return res.json();
  }
  try {
    const out = await exec('openclaw', ['cron', 'list', '--json']);
    const data = JSON.parse(out);
    const jobs = (data.jobs || []).map((job: any) => ({
      id: job.id || job.jobId,
      name: job.name || job.payload?.text || job.payload?.message || 'Unnamed task',
      schedule: job.schedule,
      enabled: job.enabled !== false,
      sessionTarget: job.sessionTarget || 'isolated',
      payload: job.payload,
      status: !job.enabled ? 'complete' : (job.schedule?.kind === 'at' ? 'queued' : 'active'),
    }));
    return { ok: true, tasks: jobs };
  } catch {
    return { ok: true, tasks: [] };
  }
}

export async function fetchUsage(): Promise<any> {
  if (!isElectron) {
    const res = await fetch(`${LOCAL_API}/api/usage`);
    return res.json();
  }
  try {
    const out = await exec('openclaw', ['status']);
    // Parse tokens from status output
    const parseNum = (s: string) => {
      s = s.trim().replace(/,/g, '');
      if (s.endsWith('k') || s.endsWith('K')) return parseFloat(s) * 1000;
      if (s.endsWith('m') || s.endsWith('M')) return parseFloat(s) * 1000000;
      return parseFloat(s) || 0;
    };
    const rows = out.match(/│[^│]+│[^│]+│[^│]+│[^│]+│\s*([\d,.]+[KkMm]?)\/([\d,.]+[KkMm]?)\s*\(\d+%\)\s*│/g) || [];
    let totalUsed = 0, totalMax = 0;
    for (const row of rows) {
      const m = row.match(/([\d,.]+[KkMm]?)\/([\d,.]+[KkMm]?)/);
      if (m) { totalUsed += parseNum(m[1]); totalMax += parseNum(m[2]); }
    }
    return { ok: true, totalTokens: totalUsed, maxTokens: totalMax, sessions: rows.length };
  } catch {
    return { ok: true, totalTokens: 0, maxTokens: 0, sessions: 0 };
  }
}

export async function fetchProviders(): Promise<{ providers: string[] }> {
  if (!isElectron) {
    const res = await fetch(`${LOCAL_API}/api/providers`);
    return res.json();
  }
  const providers = new Set<string>();
  const homedir = await getHomedir();

  // Check agent auth-profiles.json
  try {
    const raw = await readFile(`${homedir}/.openclaw/agents/main/agent/auth-profiles.json`);
    const auth = JSON.parse(raw);
    for (const [key, profile] of Object.entries(auth?.profiles || {}) as [string, any][]) {
      if (profile?.key) providers.add(key.split(':')[0].toLowerCase());
    }
  } catch {}

  // Check global openclaw.json auth profiles
  try {
    const raw = await readFile(`${homedir}/.openclaw/openclaw.json`);
    const config = JSON.parse(raw);
    for (const key of Object.keys(config?.auth?.profiles || {})) {
      providers.add(key.split(':')[0].toLowerCase());
    }
  } catch {}

  // Check .env file
  try {
    const envRaw = await readFile(`${homedir}/.openclaw/.env`);
    const envMap: Record<string, string> = {
      ANTHROPIC_API_KEY: 'anthropic', OPENAI_API_KEY: 'openai', GOOGLE_API_KEY: 'google',
      OPENROUTER_API_KEY: 'openrouter', GROQ_API_KEY: 'groq', XAI_API_KEY: 'xai', MISTRAL_API_KEY: 'mistral',
    };
    for (const line of envRaw.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.+)/);
      if (m && envMap[m[1]] && m[2].trim()) providers.add(envMap[m[1]]);
    }
  } catch {}

  return { providers: [...providers] };
}

export async function fetchProviderKeys(): Promise<Record<string, string>> {
  if (!isElectron) {
    const res = await fetch(`${LOCAL_API}/api/providers/keys`);
    return res.json();
  }
  const envMap: Record<string, string> = {
    ANTHROPIC_API_KEY: 'anthropic', OPENAI_API_KEY: 'openai',
    OPENROUTER_API_KEY: 'openrouter', GROQ_API_KEY: 'groq',
    MISTRAL_API_KEY: 'mistral', XAI_API_KEY: 'xai', GOOGLE_API_KEY: 'google',
  };
  const keys: Record<string, string> = {};
  try {
    const homedir = await getHomedir();
    const envPath = `${homedir}/.openclaw/.env`;
    const envRaw = await readFile(envPath);
    for (const line of envRaw.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.+)/);
      if (m && envMap[m[1]]) keys[envMap[m[1]]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
  return keys;
}

export async function fetchBots(): Promise<{ ok: boolean; bots: any[] }> {
  if (!isElectron) {
    const res = await fetch(`${LOCAL_API}/api/bots`);
    return res.json();
  }
  // Bots are a cloud feature — return empty in local-only mode
  return { ok: true, bots: [] };
}

export async function sendChat(message: string, history: any[], botId: string, direct: boolean): Promise<any> {
  if (!isElectron) {
    const res = await fetch(`${LOCAL_API}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history, ...(direct ? { direct: true } : { botId }) }),
    });
    return res.json();
  }

  // Talk through the local OpenClaw gateway (full agent with tools, memory, skills)
  const { url, token } = await getGatewayAuth();

  if (!token) {
    return { ok: false, reply: 'No gateway token found. Please run setup first.', botName: 'OpenClaw' };
  }

  try {
    // Read .env to figure out what provider/model is available
    let model = 'default';
    try {
      const homedir = await getHomedir();
      const envRaw = await readFile(`${homedir}/.openclaw/.env`);
      const providerModels: Record<string, string> = {
        ANTHROPIC_API_KEY: 'anthropic/claude-sonnet-4-20250514',
        OPENAI_API_KEY: 'openai/gpt-4o',
        GOOGLE_API_KEY: 'google/gemini-2.0-flash',
        OPENROUTER_API_KEY: 'openrouter/auto',
        XAI_API_KEY: 'xai/grok-3',
      };
      for (const line of envRaw.split('\n')) {
        const m = line.match(/^([A-Z_]+)=(.+)/);
        if (m && providerModels[m[1]] && m[2].trim()) {
          model = providerModels[m[1]];
          break;
        }
      }
    } catch {}

    const res = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          ...history.map((m: any) => ({ role: m.role, content: m.content })),
          { role: 'user', content: message },
        ],
      }),
    });
    const data = await res.json();
    if (data.error) {
      return { ok: false, reply: `Error: ${data.error.message}`, botName: 'OpenClaw' };
    }
    const reply = data.choices?.[0]?.message?.content || 'No response';
    return { ok: true, reply, botName: 'OpenClaw' };
  } catch (err: any) {
    return { ok: false, reply: `Error: ${err.message || 'Could not reach gateway. Is it running?'}`, botName: 'OpenClaw' };
  }
}
