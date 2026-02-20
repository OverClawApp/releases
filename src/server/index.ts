import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { handleProxy, handleGetBalance, handleGetUsage, handleGetModels, handleGetApiKey, handleWebSearch, handleWebFetch, handleProjectPlan } from './proxy.js';

// Server-side Supabase client (service role for webhook updates)
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabaseAdmin = supabaseKey
  ? createClient(
      process.env.VITE_SUPABASE_URL || 'https://fmukgsxfnqcahdgxkvce.supabase.co',
      supabaseKey,
    )
  : null;

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

app.use(cors());
// Stripe webhook needs raw body — must be before express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Serve install-agent.sh
app.get('/install-agent.sh', (_req, res) => {
  // Try multiple locations (local dev vs Railway)
  const candidates = [
    path.join(process.cwd(), 'public', 'install-agent.sh'),
    path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'public', 'install-agent.sh'),
  ];
  const scriptPath = candidates.find(p => existsSync(p));
  if (scriptPath) {
    res.type('text/x-shellscript').send(readFileSync(scriptPath, 'utf-8'));
  } else {
    res.status(404).send('install script not found');
  }
});

// Track WebSocket clients
const clients = new Set<WebSocket>();
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
});

function broadcast(msg: { type: string; data: string; command: string }) {
  const payload = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

function runCommand(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { shell: true, env: { ...process.env, PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH}` } });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { out += d.toString(); });
    proc.on('close', (code) => code === 0 ? resolve(out.trim()) : reject(new Error(out.trim() || `exit ${code}`)));
    proc.on('error', reject);
  });
}

function streamCommand(command: string, cmd: string, args: string[], res: express.Response) {
  const proc = spawn(cmd, args, { shell: true, env: { ...process.env, PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH}` } });
  
  broadcast({ type: 'output', data: `$ ${cmd} ${args.join(' ')}\n`, command });
  
  proc.stdout.on('data', (d) => broadcast({ type: 'output', data: d.toString(), command }));
  proc.stderr.on('data', (d) => broadcast({ type: 'error', data: d.toString(), command }));
  proc.on('close', (code) => {
    broadcast({ type: 'complete', data: code === 0 ? 'Done.' : `Exited with code ${code}`, command });
  });
  proc.on('error', (err) => {
    broadcast({ type: 'error', data: err.message, command });
  });

  res.json({ ok: true, message: `${command} started` });
}

// GET /api/status
app.get('/api/status', async (_req, res) => {
  try {
    let installed = false;
    let version: string | null = null;
    let gateway: 'running' | 'stopped' | 'idle' = 'stopped';
    let localUrl = 'http://127.0.0.1:18789';

    try {
      await runCommand('which', ['openclaw']);
      installed = true;
    } catch { /* not installed */ }

    if (installed) {
      try {
        const v = await runCommand('openclaw', ['--version']);
        version = v;
      } catch { /* ignore */ }

      try {
        const s = await runCommand('openclaw', ['gateway', 'status']);
        const lower = s.toLowerCase();
        if (lower.includes('running')) gateway = 'running';
        else if (lower.includes('idle')) gateway = 'idle';
        else gateway = 'stopped';
        // Try to extract URL
        const urlMatch = s.match(/https?:\/\/[^\s]+/);
        if (urlMatch) localUrl = urlMatch[0];
      } catch { /* ignore */ }
    }

    res.json({ installed, version, gateway, localUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/install
app.post('/api/install', (_req, res) => {
  streamCommand('install', 'npm', ['install', '-g', 'openclaw'], res);
});

// POST /api/onboard
app.post('/api/onboard', (_req, res) => {
  streamCommand('onboard', 'openclaw', ['onboard'], res);
});

// POST /api/gateway/start
app.post('/api/gateway/start', (_req, res) => {
  streamCommand('gateway-start', 'openclaw', ['gateway', 'start'], res);
});

// POST /api/gateway/stop
app.post('/api/gateway/stop', async (_req, res) => {
  try {
    const out = await runCommand('openclaw', ['gateway', 'stop']);
    broadcast({ type: 'output', data: `$ openclaw gateway stop\n${out}\n`, command: 'gateway-stop' });
    broadcast({ type: 'complete', data: 'Gateway stopped.', command: 'gateway-stop' });
    res.json({ ok: true });
  } catch (err: any) {
    broadcast({ type: 'error', data: err.message, command: 'gateway-stop' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/gateway/restart
app.post('/api/gateway/restart', (_req, res) => {
  streamCommand('gateway-restart', 'openclaw', ['gateway', 'restart'], res);
});

// GET /api/config
app.get('/api/config', async (_req, res) => {
  try {
    const configPath = path.join(homedir(), '.openclaw', 'openclaw.json');
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      res.json({ ok: true, config });
    } else {
      // Try CLI
      const out = await runCommand('openclaw', ['config', 'get']);
      res.json({ ok: true, config: out });
    }
  } catch (err: any) {
    res.json({ ok: false, config: null, error: err.message });
  }
});

// POST /api/model — Change the default model
app.post('/api/model', async (req, res) => {
  try {
    const { model } = req.body;
    if (!model) return res.status(400).json({ error: 'model is required' });

    const configPath = path.join(homedir(), '.openclaw', 'openclaw.json');
    if (!existsSync(configPath)) return res.status(404).json({ error: 'Config not found' });

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    if (!config.agents.defaults.model) config.agents.defaults.model = {};
    config.agents.defaults.model.primary = model;

    const { writeFileSync } = await import('fs');
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    broadcast({ type: 'output', data: `Model changed to ${model}\n`, command: 'change-model' });
    broadcast({ type: 'complete', data: 'Model updated. Restart gateway to apply.', command: 'change-model' });

    res.json({ ok: true, model });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/model — Get current model
app.get('/api/model', async (_req, res) => {
  try {
    const configPath = path.join(homedir(), '.openclaw', 'openclaw.json');
    if (!existsSync(configPath)) return res.json({ model: null });
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const model = config?.agents?.defaults?.model?.primary || null;
    res.json({ model });
  } catch (err: any) {
    res.json({ model: null });
  }
});

// POST /api/channel — Change the chat channel config
app.post('/api/channel', async (req, res) => {
  try {
    const { channel, config: channelConfig } = req.body;
    if (!channel) return res.status(400).json({ error: 'channel is required' });

    const configPath = path.join(homedir(), '.openclaw', 'openclaw.json');
    if (!existsSync(configPath)) return res.status(404).json({ error: 'Config not found' });

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    
    // Enable the plugin
    if (!config.plugins) config.plugins = {};
    if (!config.plugins.entries) config.plugins.entries = {};
    config.plugins.entries[channel] = { enabled: true };
    
    // Set channel config
    if (!config.channels) config.channels = {};
    if (!config.channels[channel]) config.channels[channel] = {};
    
    // Merge provided config
    if (channelConfig) {
      Object.entries(channelConfig).forEach(([key, value]) => {
        if (value && value !== '') {
          if (key === 'selfChatMode') {
            config.channels[channel][key] = value === 'true';
          } else {
            config.channels[channel][key] = value;
          }
        }
      });
    }

    const { writeFileSync } = await import('fs');
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    broadcast({ type: 'output', data: `Chat channel changed to ${channel}\n`, command: 'change-chat' });
    broadcast({ type: 'complete', data: 'Channel updated. Restart gateway to apply.', command: 'change-chat' });

    res.json({ ok: true, channel });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/channel — Get current channel config
app.get('/api/channel', async (_req, res) => {
  try {
    const configPath = path.join(homedir(), '.openclaw', 'openclaw.json');
    if (!existsSync(configPath)) return res.json({ channels: {} });
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    res.json({ channels: config.channels || {}, plugins: config.plugins?.entries || {} });
  } catch (err: any) {
    res.json({ channels: {}, plugins: {} });
  }
});

// POST /api/uninstall
app.post('/api/uninstall', (_req, res) => {
  streamCommand('uninstall', 'npm', ['uninstall', '-g', 'openclaw'], res);
});

// Helper to read gateway auth token
function getGatewayAuth(): { url: string; token: string } {
  const configPath = path.join(homedir(), '.openclaw', 'openclaw.json');
  const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf-8')) : {};
  const port = config?.gateway?.port || 18789;
  const token = config?.gateway?.auth?.token || '';
  return { url: `http://127.0.0.1:${port}`, token };
}

// POST /api/chat — Send message to OpenClaw agent via OpenAI-compatible endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [], botId = 'orchestrator', direct = false } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    const { url, token } = getGatewayAuth();

    // Direct mode: route into the main session so it appears in WhatsApp/terminal
    if (direct) {
      const response = await fetch(`${url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-openclaw-session-key': 'agent:main:main',
        },
        body: JSON.stringify({
          model: 'openclaw:main',
          messages: [{ role: 'user', content: message }],
          stream: false,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: errText });
      }

      const data = await response.json() as any;
      const reply = data?.choices?.[0]?.message?.content || 'No response';
      return res.json({ ok: true, reply, botName: 'OpenClaw' });
    }

    const bots = readBots();
    const botList = Object.values(bots);

    // Build system prompt based on selected bot
    let systemPrompt = '';
    let botName = 'Orchestrator';

    if (botId === 'orchestrator') {
      const onlineBots = botList.filter((b: any) => b.status === 'Online');
      const botDescriptions = botList.map((b: any) =>
        `- ${b.name} (id: ${b.id}, ${b.status}): ${b.description || 'No description'}${b.model ? ` [model: ${b.model}]` : ''}`
      ).join('\n');

      // Step 1: Ask the orchestrator to plan — which bots to use
      const planPrompt = `You are the Orchestrator. You manage a fleet of specialized bots. Analyze the user's request and decide how to handle it.

Available bots:
${botDescriptions || '(No bots configured yet)'}

Respond ONLY with valid JSON. No markdown, no explanation. Use this exact format:
- Simple task or no bots fit: {"mode":"direct"}
- Single bot: {"mode":"single","botId":"<id>"}
- Complex task needing multiple bots in parallel: {"mode":"parallel","tasks":[{"botId":"<id>","subtask":"<what this bot should do>"},...],"summary":"<brief plan>"}

Rules:
- Only use bots with status "Online"
- Use "parallel" when distinct parts of the task match different bot specialties
- Use "direct" if no bots are relevant or the task is trivial`;

      const planMessages = [
        { role: 'system', content: planPrompt },
        ...history.map((m: any) => ({ role: m.role, content: m.content })),
        { role: 'user', content: message },
      ];

      const planRes = await fetch(`${url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ model: 'openclaw:main', messages: planMessages, stream: false }),
      });

      if (!planRes.ok) {
        const errText = await planRes.text();
        return res.status(planRes.status).json({ error: errText });
      }

      const planData = await planRes.json() as any;
      const planRaw = planData?.choices?.[0]?.message?.content || '';
      
      let plan: any;
      try {
        plan = JSON.parse(planRaw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
      } catch {
        plan = { mode: 'direct' };
      }

      if (plan.mode === 'parallel' && plan.tasks?.length > 1) {
        // Parallel execution across multiple bots
        const subtaskPromises = plan.tasks.map(async (task: any) => {
          const bot = bots[task.botId];
          if (!bot) return { botName: 'Unknown', response: 'Bot not found' };
          
          const subMessages = [
            { role: 'system', content: `You are ${bot.name}. ${bot.description || ''} Be concise and focused. You are handling a specific subtask as part of a larger request.` },
            { role: 'user', content: task.subtask },
          ];

          try {
            const subRes = await fetch(`${url}/v1/chat/completions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ model: 'openclaw:main', messages: subMessages, stream: false }),
            });
            const subData = await subRes.json() as any;
            return {
              botName: bot.name,
              subtask: task.subtask,
              response: subData?.choices?.[0]?.message?.content || 'No response',
            };
          } catch (err: any) {
            return { botName: bot.name, subtask: task.subtask, response: `Error: ${err.message}` };
          }
        });

        const results = await Promise.all(subtaskPromises);

        // Step 3: Synthesize results
        const synthesisContext = results.map((r: any) =>
          `**${r.botName}** (task: ${r.subtask}):\n${r.response}`
        ).join('\n\n---\n\n');

        const synthesisMessages = [
          { role: 'system', content: `You are the Orchestrator. Multiple bots worked on parts of the user's request in parallel. Synthesize their responses into a single coherent answer. Credit each bot briefly. Be concise.` },
          { role: 'user', content: `Original request: ${message}\n\n---\n\nBot responses:\n\n${synthesisContext}` },
        ];

        const synthRes = await fetch(`${url}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ model: 'openclaw:main', messages: synthesisMessages, stream: false }),
        });
        const synthData = await synthRes.json() as any;
        const reply = synthData?.choices?.[0]?.message?.content || 'Failed to synthesize responses';
        
        const botsUsed = results.map((r: any) => r.botName);
        return res.json({ ok: true, reply, botName: `Orchestrator → ${botsUsed.join(' + ')}`, parallel: true, subtasks: results });

      } else if (plan.mode === 'single' && plan.botId && bots[plan.botId]) {
        // Route to single bot
        const bot = bots[plan.botId];
        botName = bot.name;
        systemPrompt = `You are ${bot.name}. ${bot.description || ''}${bot.model ? ` You run on model ${bot.model}.` : ''} Be helpful, concise, and stay in character for your role.`;
      } else {
        // Direct — orchestrator handles it
        systemPrompt = `You are the Orchestrator — a helpful general-purpose AI assistant. Handle this request directly. Be concise.`;
      }
    } else {
      const bot = bots[botId];
      if (bot) {
        botName = bot.name;
        systemPrompt = `You are ${bot.name}. ${bot.description || ''}${bot.model ? ` You run on model ${bot.model}.` : ''} Be helpful, concise, and stay in character for your role.`;
      }
    }

    // Single-path execution (direct, single bot, or non-orchestrator)
    const messages = [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...history.map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    const response = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: 'openclaw:main',
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json() as any;
    const reply = data?.choices?.[0]?.message?.content || 'No response';
    res.json({ ok: true, reply, botName });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks — Get cron jobs from OpenClaw as tasks
app.get('/api/tasks', async (_req, res) => {
  try {
    const out = await runCommand('openclaw', ['cron', 'list', '--json']);
    const data = JSON.parse(out);
    const jobs = (data.jobs || []).map((job: any) => ({
      id: job.id || job.jobId,
      name: job.name || job.payload?.text || job.payload?.message || 'Unnamed task',
      schedule: job.schedule,
      enabled: job.enabled !== false,
      sessionTarget: job.sessionTarget || 'isolated',
      payload: job.payload,
      // Derive status
      status: !job.enabled ? 'complete' : (job.schedule?.kind === 'at' ? 'queued' : 'active'),
    }));
    res.json({ ok: true, tasks: jobs });
  } catch (err: any) {
    // If no cron jobs or error, return empty
    res.json({ ok: true, tasks: [] });
  }
});

// POST /api/tasks — Add a new cron job/task
app.post('/api/tasks', async (req, res) => {
  try {
    const { name, schedule, payload, sessionTarget = 'isolated' } = req.body;
    
    const jobJson = JSON.stringify({
      name,
      schedule,
      payload,
      sessionTarget,
      enabled: true,
    });

    const out = await runCommand('openclaw', ['cron', 'add', '--json', JSON.stringify({
      name,
      schedule,
      payload,
      sessionTarget,
      enabled: true,
    })]);

    res.json({ ok: true, result: out });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tasks/:id — Remove a cron job
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const out = await runCommand('openclaw', ['cron', 'remove', req.params.id]);
    res.json({ ok: true, result: out });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/providers — Get configured auth profiles (which providers have API keys)
app.get('/api/providers', async (_req, res) => {
  try {
    const configPath = path.join(homedir(), '.openclaw', 'openclaw.json');
    if (!existsSync(configPath)) return res.json({ providers: [] });
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const profiles = config?.auth?.profiles || {};
    
    // Extract provider names from profile keys (e.g. "anthropic:default" → "anthropic")
    const providerSet = new Set<string>();
    for (const key of Object.keys(profiles)) {
      const provider = profiles[key]?.provider || key.split(':')[0];
      providerSet.add(provider.toLowerCase());
    }
    
    // Also check for ollama (local, no key needed)
    // Check if ollama is running
    try {
      await fetch('http://127.0.0.1:11434/api/tags');
      providerSet.add('ollama');
    } catch { /* ollama not running */ }
    
    res.json({ providers: Array.from(providerSet), profiles });
  } catch (err: any) {
    res.json({ providers: [], profiles: {} });
  }
});

// POST /api/providers — Add/update a provider API key
app.post('/api/providers', async (req, res) => {
  try {
    const { provider, apiKey, profileName } = req.body;
    if (!provider) return res.status(400).json({ error: 'provider required' });

    const configPath = path.join(homedir(), '.openclaw', 'openclaw.json');
    if (!existsSync(configPath)) return res.status(404).json({ error: 'Config not found' });

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (!config.auth) config.auth = {};
    if (!config.auth.profiles) config.auth.profiles = {};

    const key = profileName || `${provider}:default`;
    config.auth.profiles[key] = {
      provider,
      mode: 'api_key',
    };

    // Store the API key in the environment variable convention
    // OpenClaw reads keys from env vars based on provider
    const envMap: Record<string, string> = {
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      venice: 'VENICE_API_KEY',
      groq: 'GROQ_API_KEY',
      mistral: 'MISTRAL_API_KEY',
      xai: 'XAI_API_KEY',
    };

    const { writeFileSync } = await import('fs');
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Write API key to ~/.openclaw/.env if provided
    if (apiKey && envMap[provider]) {
      const envPath = path.join(homedir(), '.openclaw', '.env');
      let envContent = '';
      if (existsSync(envPath)) {
        envContent = readFileSync(envPath, 'utf-8');
        // Replace existing key
        const regex = new RegExp(`^${envMap[provider]}=.*$`, 'm');
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${envMap[provider]}=${apiKey}`);
        } else {
          envContent += `\n${envMap[provider]}=${apiKey}`;
        }
      } else {
        envContent = `${envMap[provider]}=${apiKey}`;
      }
      writeFileSync(envPath, envContent.trim() + '\n');
    }

    broadcast({ type: 'output', data: `Provider ${provider} configured\n`, command: 'add-provider' });
    broadcast({ type: 'complete', data: 'Provider added. Restart gateway to apply.', command: 'add-provider' });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/system-info
app.get('/api/system-info', (_req, res) => {
  const os = require('os');
  res.json({
    version: '2026.2.9',
    build: process.env.BUILD_HASH || '33c75cb',
    runtime: `Node ${process.version}`,
    os: `${os.type()} ${os.release()} (${os.arch()})`,
    hostname: os.hostname(),
    cpus: os.cpus().length,
    memory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`,
    uptime: `${Math.round(os.uptime() / 3600)}h`,
  });
});

// GET /api/providers/keys — Get local API keys for syncing to cloud
app.get('/api/providers/keys', async (_req, res) => {
  try {
    const envMap: Record<string, string> = {
      ANTHROPIC_API_KEY: 'anthropic',
      OPENAI_API_KEY: 'openai',
      OPENROUTER_API_KEY: 'openrouter',
      VENICE_API_KEY: 'venice',
      GROQ_API_KEY: 'groq',
      MISTRAL_API_KEY: 'mistral',
      XAI_API_KEY: 'xai',
      GOOGLE_API_KEY: 'google',
    };

    const keys: Record<string, string> = {};

    // 1. Check process environment variables (OpenClaw injects these at runtime)
    for (const [envVar, provider] of Object.entries(envMap)) {
      if (process.env[envVar]) {
        keys[provider] = process.env[envVar]!;
      }
    }

    // 2. Also check ~/.openclaw/.env file if it exists
    const envPath = path.join(homedir(), '.openclaw', '.env');
    if (existsSync(envPath)) {
      const envContent = readFileSync(envPath, 'utf-8');
      for (const line of envContent.split('\n')) {
        const match = line.match(/^([A-Z_]+)=(.+)$/);
        if (match && envMap[match[1]] && !keys[envMap[match[1]]]) {
          keys[envMap[match[1]]] = match[2].trim();
        }
      }
    }

    // 3. Check openclaw config for configured providers (even without keys accessible)
    const configPath = path.join(homedir(), '.openclaw', 'openclaw.json');
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      const profiles = config?.auth?.profiles || {};
      for (const [key, profile] of Object.entries(profiles) as any[]) {
        const provider = profile?.provider || key.split(':')[0];
        if (provider && !keys[provider.toLowerCase()]) {
          keys[provider.toLowerCase()] = '__configured_no_key__';
        }
      }
    }

    res.json({ keys });
  } catch {
    res.json({ keys: {} });
  }
});

// DELETE /api/providers/:provider — Remove a provider
app.delete('/api/providers/:provider', async (req, res) => {
  try {
    const provider = req.params.provider;
    const configPath = path.join(homedir(), '.openclaw', 'openclaw.json');
    if (!existsSync(configPath)) return res.status(404).json({ error: 'Config not found' });

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const profiles = config?.auth?.profiles || {};
    
    // Remove matching profiles
    for (const key of Object.keys(profiles)) {
      if (key.startsWith(provider + ':') || profiles[key]?.provider === provider) {
        delete profiles[key];
      }
    }

    const { writeFileSync } = await import('fs');
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/usage — Get token usage from OpenClaw sessions
app.get('/api/usage', async (_req, res) => {
  try {
    const out = await runCommand('openclaw', ['status']);

    // Parse session rows: "│ key │ kind │ age │ model │ 14k/200k (7%) │"
    const sessionRows = out.match(/│[^│]+│[^│]+│[^│]+│[^│]+│\s*([\d,.]+[KkMm]?)\/([\d,.]+[KkMm]?)\s*\(\d+%\)\s*│/g) || [];

    const parseNum = (s: string) => {
      s = s.trim().replace(/,/g, '');
      if (s.endsWith('k') || s.endsWith('K')) return parseFloat(s) * 1000;
      if (s.endsWith('m') || s.endsWith('M')) return parseFloat(s) * 1000000;
      return parseFloat(s) || 0;
    };

    let totalContextUsed = 0;
    let totalContextMax = 0;
    let sessionCount = 0;

    for (const row of sessionRows) {
      const m = row.match(/([\d,.]+[KkMm]?)\/([\d,.]+[KkMm]?)\s*\(\d+%\)/);
      if (m) {
        totalContextUsed += parseNum(m[1]);
        totalContextMax += parseNum(m[2]);
        sessionCount++;
      }
    }

    // Extract model from "default main active" line then "Model" column
    const modelMatch = out.match(/claude[\w-]*/i) || out.match(/gpt[\w-]*/i) || out.match(/default\s+(\S+)/);
    const model = modelMatch ? (modelMatch[0].startsWith('default') ? modelMatch[1] : modelMatch[0]) : '';

    res.json({
      ok: true,
      usage: {
        contextTokensUsed: totalContextUsed,
        contextTokensMax: totalContextMax,
        sessions: sessionCount,
        model,
      },
    });
  } catch (err: any) {
    res.json({ ok: true, usage: null, error: err.message });
  }
});

// ─── Node Management ───────────────────────────────────────────────────────

import { writeFileSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';

const NODES_PATH = path.join(homedir(), '.overclaw', 'nodes.json');

function readNodes(): Record<string, any> {
  try {
    if (existsSync(NODES_PATH)) {
      return JSON.parse(readFileSync(NODES_PATH, 'utf-8')).nodes || {};
    }
  } catch {}
  return {};
}

function writeNodes(nodes: Record<string, any>) {
  mkdirSync(path.dirname(NODES_PATH), { recursive: true });
  writeFileSync(NODES_PATH, JSON.stringify({ nodes }, null, 2));
}

function withStatus(node: any) {
  const copy = { ...node };
  if (copy.lastHeartbeat) {
    const age = Date.now() - new Date(copy.lastHeartbeat).getTime();
    if (age > 60_000 && copy.status === 'online') copy.status = 'offline';
  }
  return copy;
}

// GET /api/nodes
app.get('/api/nodes', (_req, res) => {
  const nodes = readNodes();
  const list = Object.values(nodes).map(withStatus);
  res.json({ ok: true, nodes: list });
});

// GET /api/nodes/:id
app.get('/api/nodes/:id', (req, res) => {
  const nodes = readNodes();
  const node = nodes[req.params.id];
  if (!node) return res.status(404).json({ error: 'Node not found' });
  res.json({ ok: true, node: withStatus(node) });
});

// POST /api/nodes/register
app.post('/api/nodes/register', (req, res) => {
  const { name, type, hostname, os, arch, cpus, memory, tags, ip } = req.body;
  const id = randomUUID();
  const now = new Date().toISOString();
  const node = {
    id, name: name || hostname, type: type || 'personal', hostname, os, arch,
    cpus, memory, status: 'online', ip: ip || req.ip,
    registeredAt: now, lastHeartbeat: now, bots: [], tags: tags || [], agentVersion: '1.0.0',
  };
  const nodes = readNodes();
  nodes[id] = node;
  writeNodes(nodes);
  res.json({ ok: true, node });
});

// POST /api/nodes/:id/heartbeat
app.post('/api/nodes/:id/heartbeat', (req, res) => {
  const nodes = readNodes();
  const node = nodes[req.params.id];
  if (!node) return res.status(404).json({ error: 'Node not found' });
  node.lastHeartbeat = new Date().toISOString();
  node.status = 'online';
  if (req.body.cpuUsage !== undefined) node.cpuUsage = req.body.cpuUsage;
  if (req.body.memUsage !== undefined) node.memUsage = req.body.memUsage;
  writeNodes(nodes);
  res.json({ ok: true });
});

// PATCH /api/nodes/:id
app.patch('/api/nodes/:id', (req, res) => {
  const nodes = readNodes();
  const node = nodes[req.params.id];
  if (!node) return res.status(404).json({ error: 'Node not found' });
  if (req.body.name) node.name = req.body.name;
  if (req.body.tags) node.tags = req.body.tags;
  writeNodes(nodes);
  res.json({ ok: true, node });
});

// DELETE /api/nodes/:id
app.delete('/api/nodes/:id', (req, res) => {
  const nodes = readNodes();
  if (!nodes[req.params.id]) return res.status(404).json({ error: 'Node not found' });
  delete nodes[req.params.id];
  writeNodes(nodes);
  res.json({ ok: true });
});

// POST /api/nodes/:id/deploy
app.post('/api/nodes/:id/deploy', (req, res) => {
  const nodes = readNodes();
  const node = nodes[req.params.id];
  if (!node) return res.status(404).json({ error: 'Node not found' });
  const { botName, botConfig } = req.body;
  if (!botName) return res.status(400).json({ error: 'botName required' });
  node.bots.push({ botName, botConfig, deployedAt: new Date().toISOString() });
  writeNodes(nodes);
  res.json({ ok: true, node });
});

// ─── Bot Management ────────────────────────────────────────────────────────

const BOTS_PATH = path.join(homedir(), '.overclaw', 'bots.json');

interface BotData {
  id: string; name: string; description: string; model: string;
  status: 'Online' | 'Stopped' | 'Deploying' | 'Error';
  nodeId: string | null; nodeName: string | null; nodeType: string | null;
  region: string; createdAt: string; url: string | null;
}

function readBots(): Record<string, BotData> {
  try {
    if (existsSync(BOTS_PATH)) {
      return JSON.parse(readFileSync(BOTS_PATH, 'utf-8')).bots || {};
    }
  } catch {}
  return {};
}

function writeBots(bots: Record<string, BotData>) {
  mkdirSync(path.dirname(BOTS_PATH), { recursive: true });
  writeFileSync(BOTS_PATH, JSON.stringify({ bots }, null, 2));
}

// GET /api/bots
app.get('/api/bots', (_req, res) => {
  const bots = readBots();
  res.json({ ok: true, bots: Object.values(bots) });
});

// POST /api/bots
app.post('/api/bots', (req, res) => {
  const { name, description, model, region, nodeId } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = randomUUID();
  const now = new Date().toISOString();

  let nodeName: string | null = null;
  let nodeType: string | null = null;
  if (nodeId) {
    const nodes = readNodes();
    const node = nodes[nodeId];
    if (node) { nodeName = node.name; nodeType = node.type; }
  }

  const bot: BotData = {
    id, name, description: description || '', model: model || '',
    status: 'Stopped', nodeId: nodeId || null, nodeName, nodeType,
    region: region || 'London (eu-west-2)', createdAt: now, url: null,
  };
  const bots = readBots();
  bots[id] = bot;
  writeBots(bots);
  res.json({ ok: true, bot });
});

// PATCH /api/bots/:id
app.patch('/api/bots/:id', (req, res) => {
  const bots = readBots();
  const bot = bots[req.params.id];
  if (!bot) return res.status(404).json({ error: 'Bot not found' });

  const { name, description, model, region, nodeId, status } = req.body;
  if (name !== undefined) bot.name = name;
  if (description !== undefined) bot.description = description;
  if (model !== undefined) bot.model = model;
  if (region !== undefined) bot.region = region;
  if (status !== undefined) bot.status = status;
  if (nodeId !== undefined) {
    bot.nodeId = nodeId || null;
    bot.nodeName = null;
    bot.nodeType = null;
    if (nodeId) {
      const nodes = readNodes();
      const node = nodes[nodeId];
      if (node) { bot.nodeName = node.name; bot.nodeType = node.type; }
    }
  }

  writeBots(bots);
  res.json({ ok: true, bot });
});

// DELETE /api/bots/:id
app.delete('/api/bots/:id', (req, res) => {
  const bots = readBots();
  if (!bots[req.params.id]) return res.status(404).json({ error: 'Bot not found' });
  delete bots[req.params.id];
  writeBots(bots);
  res.json({ ok: true });
});

// POST /api/bots/:id/start
app.post('/api/bots/:id/start', (req, res) => {
  const bots = readBots();
  const bot = bots[req.params.id];
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  bot.status = 'Online';
  writeBots(bots);
  res.json({ ok: true, bot });
});

// POST /api/bots/:id/stop
app.post('/api/bots/:id/stop', (req, res) => {
  const bots = readBots();
  const bot = bots[req.params.id];
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  bot.status = 'Stopped';
  writeBots(bots);
  res.json({ ok: true, bot });
});

// ─── Billing Management ────────────────────────────────────────────────────

const BILLING_PATH = path.join(homedir(), '.overclaw', 'billing.json');

interface BillingBotData { budget: number | null; spent: number; tokens: number; requests: number }
interface BillingData {
  overall: { budget: number; spent: number; resetDay: number };
  bots: Record<string, BillingBotData>;
}

function readBilling(): BillingData {
  try {
    if (existsSync(BILLING_PATH)) {
      return JSON.parse(readFileSync(BILLING_PATH, 'utf-8'));
    }
  } catch {}
  return { overall: { budget: 120, spent: 0, resetDay: 1 }, bots: {} };
}

function writeBilling(data: BillingData) {
  mkdirSync(path.dirname(BILLING_PATH), { recursive: true });
  writeFileSync(BILLING_PATH, JSON.stringify(data, null, 2));
}

// GET /api/billing
app.get('/api/billing', (_req, res) => {
  const billing = readBilling();
  const bots = readBots();
  // Ensure every bot has a billing entry
  for (const id of Object.keys(bots)) {
    if (!billing.bots[id]) {
      billing.bots[id] = { budget: null, spent: 0, tokens: 0, requests: 0 };
    }
  }
  // Merge bot names
  const botsWithNames = Object.entries(billing.bots).map(([id, b]) => ({
    id, ...b, name: bots[id]?.name || 'Unknown', status: bots[id]?.status || 'Unknown', model: bots[id]?.model || null,
  }));
  res.json({ ok: true, overall: billing.overall, bots: botsWithNames });
});

// PATCH /api/billing
app.patch('/api/billing', (req, res) => {
  const billing = readBilling();
  if (req.body.budget !== undefined) billing.overall.budget = req.body.budget;
  if (req.body.resetDay !== undefined) billing.overall.resetDay = req.body.resetDay;
  writeBilling(billing);
  res.json({ ok: true, overall: billing.overall });
});

// PATCH /api/billing/bots/:id
app.patch('/api/billing/bots/:id', (req, res) => {
  const billing = readBilling();
  if (!billing.bots[req.params.id]) {
    billing.bots[req.params.id] = { budget: null, spent: 0, tokens: 0, requests: 0 };
  }
  billing.bots[req.params.id].budget = req.body.budget;
  writeBilling(billing);
  res.json({ ok: true, bot: billing.bots[req.params.id] });
});

// POST /api/billing/bots/:id/usage
app.post('/api/billing/bots/:id/usage', (req, res) => {
  const billing = readBilling();
  const botId = req.params.id;
  if (!billing.bots[botId]) {
    billing.bots[botId] = { budget: null, spent: 0, tokens: 0, requests: 0 };
  }
  const b = billing.bots[botId];
  b.spent += req.body.cost || 0;
  b.tokens += req.body.tokens || 0;
  b.requests += req.body.requests || 0;
  billing.overall.spent += req.body.cost || 0;
  writeBilling(billing);

  // Auto-stop logic
  const bots = readBots();
  let stopped: string[] = [];

  // Check per-bot budget
  if (b.budget !== null && b.spent >= b.budget && bots[botId] && bots[botId].status === 'Online') {
    bots[botId].status = 'Stopped';
    stopped.push(botId);
  }

  // Check overall budget
  if (billing.overall.spent >= billing.overall.budget) {
    for (const [id, bot] of Object.entries(bots)) {
      if (bot.status === 'Online') {
        bot.status = 'Stopped';
        stopped.push(id);
      }
    }
  }

  if (stopped.length > 0) writeBots(bots);
  res.json({ ok: true, stopped });
});

// ═══════════════════════════════════════════
// AI Proxy — Keyless model routing
// ═══════════════════════════════════════════

// OpenAI-compatible proxy endpoint
app.post('/api/v1/chat/completions', handleProxy);

// Web search & fetch (proxied through Brave API)
app.post('/api/v1/search', handleWebSearch);
app.post('/api/v1/fetch', handleWebFetch);

// Token balance
app.get('/api/proxy/balance', handleGetBalance);

// Usage history
app.get('/api/proxy/usage', handleGetUsage);

// Available models
app.get('/api/proxy/models', handleGetModels);

// Get user API key (for gateway config)
app.get('/api/proxy/apikey', handleGetApiKey);

// Project planner
app.post('/api/projects/plan', handleProjectPlan);

// ═══════════════════════════════════════════
// Stripe Billing
// ═══════════════════════════════════════════
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null as any;

const STRIPE_PRICES: Record<string, Record<string, string>> = {
  pro: { monthly: 'price_1T1tTLEFXOKXciuuso4PEOQ8' },
};

// POST /api/stripe/checkout — Create a Stripe Checkout session
app.post('/api/stripe/checkout', async (req, res) => {
  try {
    const { plan, interval, userId, email, scaleNodes } = req.body;
    if (!plan || !interval || !userId) return res.status(400).json({ error: 'plan, interval, userId required' });

    const priceId = STRIPE_PRICES[plan]?.[interval];
    if (!priceId) return res.status(400).json({ error: 'Invalid plan or interval' });

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: priceId, quantity: 1 },
    ];

    // Add extra nodes for Scale tier
    if (plan === 'scale' && scaleNodes && scaleNodes > 3) {
      lineItems.push({
        price: STRIPE_PRICES.scale.extraNode,
        quantity: scaleNodes - 3,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: lineItems,
      customer_email: email,
      client_reference_id: userId,
      allow_promotion_codes: true,
      metadata: { plan, interval, userId, scaleNodes: String(scaleNodes || 0) },
      success_url: `${req.headers.origin || 'http://localhost:5173'}/?billing=success&plan=${plan}`,
      cancel_url: `${req.headers.origin || 'http://localhost:5173'}/?billing=cancelled`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stripe/checkout-tokens — One-time token pack purchase
app.post('/api/stripe/checkout-tokens', async (req, res) => {
  try {
    const { tokens, price, userId, email } = req.body;
    if (!tokens || !price || !userId) return res.status(400).json({ error: 'tokens, price, userId required' });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(price * 100),
          product_data: {
            name: `${tokens.toLocaleString()} OverClaw Tokens`,
            description: `Top up your OverClaw token balance with ${tokens.toLocaleString()} tokens`,
          },
        },
        quantity: 1,
      }],
      customer_email: email,
      client_reference_id: userId,
      allow_promotion_codes: true,
      metadata: { type: 'token_purchase', tokens: String(tokens), userId },
      success_url: `${req.headers.origin || 'http://localhost:5173'}/?billing=tokens-success&tokens=${tokens}`,
      cancel_url: `${req.headers.origin || 'http://localhost:5173'}/?billing=cancelled`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error('Token checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stripe/portal — Create a Stripe Customer Portal session
app.post('/api/stripe/portal', async (req, res) => {
  try {
    const { userId, customerId: directCustomerId } = req.body;
    let customerId = directCustomerId;

    // Look up customer ID from subscription if only userId provided
    if (!customerId && userId && supabaseAdmin) {
      const { data } = await supabaseAdmin
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', userId)
        .single();
      customerId = data?.stripe_customer_id;
    }

    // Fallback: look up customer by email in Stripe directly
    if (!customerId && userId && supabaseAdmin) {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (userData?.user?.email) {
        const customers = await stripe.customers.list({ email: userData.user.email, limit: 1 });
        if (customers.data.length > 0) {
          customerId = customers.data[0].id;
          // Save for next time
          await supabaseAdmin.from('subscriptions').upsert({
            user_id: userId,
            stripe_customer_id: customerId,
            plan: 'pro',
            status: 'active',
          }, { onConflict: 'user_id' });
        }
      }
    }

    if (!customerId) return res.status(400).json({ error: 'No Stripe customer found. Please subscribe first.' });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${req.headers.origin || 'http://localhost:5173'}/?billing=portal-return`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stripe/webhook — Handle Stripe webhook events
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
app.post('/api/stripe/webhook', async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });
  const sig = req.headers['stripe-signature'];
  let event: any;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig as string, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }
  try {

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id;
        const customerId = session.customer;

        // Token pack purchase (one-time payment)
        if (session.metadata?.type === 'token_purchase') {
          const tokens = parseInt(session.metadata.tokens || '0');
          console.log(`✅ Token purchase: user=${userId} tokens=${tokens}`);
          if (userId && tokens > 0) {
            await supabaseAdmin.rpc('add_tokens', { p_user_id: userId, p_amount: tokens });
          }
          break;
        }

        // Subscription checkout
        const plan = session.metadata?.plan;
        const interval = session.metadata?.interval || 'monthly';
        const subscriptionId = session.subscription;
        const scaleNodes = session.metadata?.scaleNodes ? parseInt(session.metadata.scaleNodes) : null;
        console.log(`✅ Checkout completed: user=${userId} plan=${plan} customer=${customerId}`);

        if (userId && plan) {
          await supabaseAdmin.from('subscriptions').update({
            plan,
            status: 'active',
            billing_interval: interval,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            ...(scaleNodes ? { scale_nodes: scaleNodes } : {}),
          }).eq('user_id', userId);

          // Credit 2000 tokens for pro plan activation
          if (plan === 'pro') {
            await supabaseAdmin.rpc('add_tokens', { p_user_id: userId, p_amount: 2000 });
          }
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        console.log(`🔄 Subscription updated: ${sub.id} status=${sub.status}`);
        const statusMap: Record<string, string> = {
          active: 'active', past_due: 'past_due', canceled: 'cancelled', unpaid: 'past_due',
        };
        await supabaseAdmin.from('subscriptions').update({
          status: statusMap[sub.status] || sub.status,
        }).eq('stripe_subscription_id', sub.id);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        console.log(`❌ Subscription cancelled: ${sub.id}`);
        await supabaseAdmin.from('subscriptions').update({
          plan: 'local',
          status: 'active',
          stripe_subscription_id: null,
        }).eq('stripe_subscription_id', sub.id);
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object;
        console.log(`💰 Invoice paid: ${invoice.id} amount=${invoice.amount_paid}`);
        // Find user by stripe customer ID and record invoice
        const { data: subs } = await supabaseAdmin.from('subscriptions')
          .select('user_id').eq('stripe_customer_id', invoice.customer).limit(1);
        if (subs?.[0]) {
          await supabaseAdmin.from('invoices').insert({
            user_id: subs[0].user_id,
            stripe_invoice_id: invoice.id,
            amount: invoice.amount_paid / 100,
            status: 'paid',
            period_start: new Date(invoice.period_start * 1000).toISOString(),
            period_end: new Date(invoice.period_end * 1000).toISOString(),
          });
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.log(`⚠️ Payment failed: ${invoice.id}`);
        const { data: subs } = await supabaseAdmin.from('subscriptions')
          .select('user_id').eq('stripe_customer_id', invoice.customer).limit(1);
        if (subs?.[0]) {
          await supabaseAdmin.from('invoices').upsert({
            user_id: subs[0].user_id,
            stripe_invoice_id: invoice.id,
            amount: invoice.amount_due / 100,
            status: 'failed',
            period_start: new Date(invoice.period_start * 1000).toISOString(),
            period_end: new Date(invoice.period_end * 1000).toISOString(),
          }, { onConflict: 'stripe_invoice_id' });
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error('Webhook error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// WebSocket Relay — Device ↔ Web bridge
// ═══════════════════════════════════════════

// Authenticate a WebSocket connection via oc_ API key (query param or first message)
async function authenticateRelay(apiKey: string): Promise<string | null> {
  if (!supabaseAdmin || !apiKey?.startsWith('oc_')) return null;
  try {
    const { data } = await supabaseAdmin
      .from('user_api_keys')
      .select('user_id')
      .eq('api_key', apiKey)
      .single();
    return data?.user_id ?? null;
  } catch { return null; }
}

async function authenticateRelayHttp(req: express.Request): Promise<string | null> {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return token ? authenticateRelay(token) : null;
}

// Maps:
interface NodeConnection {
  ws: WebSocket;
  nodeId: string;
  gatewayPort?: number;
  securityTier?: string;
}

// deviceSockets: userId → (nodeId → connection)
// webSockets: userId → Set<ws>
const deviceSockets = new Map<string, Map<string, NodeConnection>>();
const webSockets = new Map<string, Set<WebSocket>>();

function getOnlineNodes(userId: string): Array<{ nodeId: string; online: boolean; gatewayPort?: number; securityTier?: string }> {
  const nodes = deviceSockets.get(userId);
  if (!nodes) return [];
  const out: Array<{ nodeId: string; online: boolean; gatewayPort?: number; securityTier?: string }> = [];
  for (const [nodeId, conn] of nodes.entries()) {
    out.push({ nodeId, online: conn.ws.readyState === WebSocket.OPEN, gatewayPort: conn.gatewayPort, securityTier: conn.securityTier });
  }
  return out;
}

function setDeviceSocket(userId: string, nodeId: string, ws: WebSocket, gatewayPort?: number, securityTier?: string) {
  if (!deviceSockets.has(userId)) deviceSockets.set(userId, new Map());
  const byNode = deviceSockets.get(userId)!;
  const existing = byNode.get(nodeId);
  if (existing && existing.ws !== ws) {
    try { existing.ws.close(); } catch {}
  }
  byNode.set(nodeId, { ws, nodeId, gatewayPort, securityTier });
}

function removeDeviceSocket(userId: string, nodeId: string, ws: WebSocket) {
  const byNode = deviceSockets.get(userId);
  if (!byNode) return;
  const conn = byNode.get(nodeId);
  if (conn?.ws === ws) byNode.delete(nodeId);
  if (byNode.size === 0) deviceSockets.delete(userId);
}

function addWebSocket(userId: string, ws: WebSocket) {
  if (!webSockets.has(userId)) webSockets.set(userId, new Set());
  webSockets.get(userId)!.add(ws);
}

function removeWebSocket(userId: string, ws: WebSocket) {
  const set = webSockets.get(userId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) webSockets.delete(userId);
  }
}

function sendToAllWeb(userId: string, msg: any) {
  const set = webSockets.get(userId);
  if (!set) return;
  const payload = typeof msg === 'string' ? msg : JSON.stringify(msg);
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

function sendToAllDeviceNodes(userId: string, msg: any) {
  const byNode = deviceSockets.get(userId);
  if (!byNode) return;
  const payload = typeof msg === 'string' ? msg : JSON.stringify(msg);
  for (const conn of byNode.values()) {
    if (conn.ws.readyState === WebSocket.OPEN) conn.ws.send(payload);
  }
}

function sendToDeviceNode(userId: string, nodeId: string, msg: any): boolean {
  const byNode = deviceSockets.get(userId);
  if (!byNode) return false;
  const conn = byNode.get(nodeId);
  if (!conn || conn.ws.readyState !== WebSocket.OPEN) return false;
  conn.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  return true;
}

// GET /api/relay/nodes — authenticated list of online nodes
app.get('/api/relay/nodes', async (req, res) => {
  const userId = await authenticateRelayHttp(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const nodes = getOnlineNodes(userId);
  res.json({ ok: true, nodes });
});

// Device WebSocket endpoint — desktop app connects here
const wssDevice = new WebSocketServer({ noServer: true });
wssDevice.on('connection', (ws, req) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const apiKey = url.searchParams.get('key') || '';
  const urlNodeId = url.searchParams.get('nodeId') || 'node-1';

  let userId: string | null = null;
  let authenticated = false;
  let nodeId = urlNodeId || 'node-1';

  const finishAuth = (uid: string, incomingNodeId?: string, gatewayPort?: number, securityTier?: string) => {
    userId = uid;
    authenticated = true;
    nodeId = incomingNodeId || nodeId || 'node-1';
    setDeviceSocket(uid, nodeId, ws, gatewayPort, securityTier);
    ws.send(JSON.stringify({ type: 'relay.connected', userId: uid, nodeId, gatewayPort, securityTier }));
    sendToAllWeb(uid, { type: 'relay.node_online', nodeId, gatewayPort, securityTier });
    console.log(`[Relay] Device connected: user=${uid} node=${nodeId}`);
  };

  authenticateRelay(apiKey).then(uid => {
    if (uid) finishAuth(uid, urlNodeId);
    else ws.send(JSON.stringify({ type: 'relay.error', message: 'Authentication required. Send: {"type":"auth","key":"oc_..."}' }));
  });

  ws.on('message', (raw) => {
    let msg: any;
    try { msg = JSON.parse(String(raw)); } catch { return; }

    if (authenticated && msg.type === 'auth' && userId) {
      const byNode = deviceSockets.get(userId);
      const conn = byNode?.get(nodeId);
      if (conn) {
        conn.gatewayPort = msg.gatewayPort ?? conn.gatewayPort;
        conn.securityTier = msg.securityTier ?? conn.securityTier;
      }
      sendToAllWeb(userId, { type: 'relay.security_update', nodeId, tier: msg.securityTier, gatewayPort: msg.gatewayPort });
      return;
    }

    if (!authenticated && msg.type === 'auth') {
      authenticateRelay(msg.key).then(uid => {
        if (!uid) return ws.send(JSON.stringify({ type: 'relay.error', message: 'Invalid API key' }));
        finishAuth(uid, msg.nodeId || urlNodeId || 'node-1', msg.gatewayPort, msg.securityTier);
      });
      return;
    }

    if (!authenticated || !userId) return;

    if (msg.type === 'relay.node_message') {
      const fromNodeId = msg.fromNodeId || msg.sourceNodeId || nodeId;
      const toNodeId = msg.toNodeId;
      if (!toNodeId) {
        ws.send(JSON.stringify({ type: 'relay.error', message: 'relay.node_message requires toNodeId' }));
        return;
      }
      const delivered = sendToDeviceNode(userId, toNodeId, {
        type: 'relay.node_message',
        fromNodeId,
        toNodeId,
        payload: msg.payload,
      });
      if (!delivered) ws.send(JSON.stringify({ type: 'relay.error', message: `Target node offline: ${toNodeId}` }));
      return;
    }

    if (msg.type === 'relay.security_update') {
      const byNode = deviceSockets.get(userId);
      const conn = byNode?.get(nodeId);
      if (conn) {
        conn.gatewayPort = msg.gatewayPort ?? conn.gatewayPort;
        conn.securityTier = msg.tier ?? msg.securityTier ?? conn.securityTier;
      }
      const outbound = { ...msg, sourceNodeId: msg.sourceNodeId || nodeId };
      sendToAllWeb(userId, outbound);
      return;
    }

    if (msg.type?.startsWith('relay.')) {
      const outbound = { ...msg, sourceNodeId: msg.sourceNodeId || nodeId };
      sendToAllWeb(userId, outbound);
    }
  });

  ws.on('close', () => {
    if (userId) {
      const closedNodeId = nodeId || 'node-1';
      removeDeviceSocket(userId, closedNodeId, ws);
      sendToAllWeb(userId, { type: 'relay.node_offline', nodeId: closedNodeId });
      console.log(`[Relay] Device disconnected: user=${userId} node=${closedNodeId}`);
    }
  });
});

// Web WebSocket endpoint — website connects here
const wssWeb = new WebSocketServer({ noServer: true });
wssWeb.on('connection', (ws, req) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const apiKey = url.searchParams.get('key') || '';
  let userId: string | null = null;
  let authenticated = false;

  const finishAuth = (uid: string) => {
    userId = uid;
    authenticated = true;
    addWebSocket(uid, ws);
    const nodes = getOnlineNodes(uid);
    ws.send(JSON.stringify({ type: 'relay.connected', userId: uid, nodes, deviceOnline: nodes.length > 0 }));
    console.log(`[Relay] Web connected: user=${uid} nodes=${nodes.length}`);
  };

  authenticateRelay(apiKey).then(uid => {
    if (uid) finishAuth(uid);
    else ws.send(JSON.stringify({ type: 'relay.error', message: 'Authentication required. Send: {"type":"auth","key":"oc_..."}' }));
  });

  ws.on('message', (raw) => {
    let msg: any;
    try { msg = JSON.parse(String(raw)); } catch { return; }

    if (!authenticated && msg.type === 'auth') {
      authenticateRelay(msg.key).then(uid => {
        if (!uid) return ws.send(JSON.stringify({ type: 'relay.error', message: 'Invalid API key' }));
        finishAuth(uid);
      });
      return;
    }

    if (!authenticated || !userId) return;

    if (msg.type?.startsWith('relay.')) {
      const outbound = { ...msg, sourceNodeId: msg.sourceNodeId || 'web' };
      // Node-targeted web->device route (backward-compatible broadcast)
      if (outbound.targetNodeId) {
        const delivered = sendToDeviceNode(userId, outbound.targetNodeId, outbound);
        if (!delivered) {
          ws.send(JSON.stringify({ type: 'relay.error', message: `Target node offline: ${outbound.targetNodeId}` }));
        }
      } else {
        sendToAllDeviceNodes(userId, outbound);
      }
    }
  });

  ws.on('close', () => {
    if (userId) {
      removeWebSocket(userId, ws);
      console.log(`[Relay] Web disconnected: user=${userId}`);
    }
  });
});

// Handle upgrade requests — route to correct WebSocket server
server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url || '/', `http://${req.headers.host}`).pathname;
  if (pathname === '/ws/device') {
    wssDevice.handleUpgrade(req, socket, head, (ws) => wssDevice.emit('connection', ws, req));
  } else if (pathname === '/ws/web') {
    wssWeb.handleUpgrade(req, socket, head, (ws) => wssWeb.emit('connection', ws, req));
  } else if (pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

// Health endpoint for relay status
app.get('/api/relay/status', (_req, res) => {
  res.json({
    ok: true,
    deviceUsers: deviceSockets.size,
    webUsers: webSockets.size,
    totalNodes: Array.from(deviceSockets.values()).reduce((sum, m) => sum + m.size, 0),
  });
});

const PORT = parseInt(process.env.PORT || '3001', 10);
server.listen(PORT, () => {
  console.log(`OverClaw server running on http://localhost:${PORT}`);
});
