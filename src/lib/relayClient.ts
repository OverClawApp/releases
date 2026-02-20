/**
 * RelayClient — connects the desktop app to the Railway relay server.
 */

import { decrypt, deriveSharedKey, encrypt, generateKeyPair } from './relayCrypto';
import { DEFAULT_RATE_LIMITS, type RateLimitConfig, type SecurityTier } from './securityTiers';

const RELAY_URL = 'wss://overclaw-api-production.up.railway.app/ws/device';
const PLAIN_FIELDS = new Set(['type', 'sourceNodeId', 'targetNodeId', 'id', 'rpcId', 'publicKey']);
const RATE_LIMITS_KEY = 'overclaw-node-ratelimits';

export interface ProjectTask {
  title: string;
  description: string;
  estimatedMinutes: number;
  dependencies: number[];
  index: number;
}

export type WsRequest = (method: string, params: any) => Promise<any>;

export interface RelayCallbacks {
  onWebMessage: (text: string, id: string) => void;
  onWebAbort: () => void;
  onWebHistoryRequest: (id: string) => void;
  onScheduleTasks?: (projectName: string, tasks: ProjectTask[]) => void;
  onPauseProject?: (projectName: string) => void;
  onStopProject?: (projectName: string) => void;
  onResumeProject?: (projectName: string) => void;
  getWsRequest?: () => WsRequest | null;
}

export class RelayClient {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private callbacks: RelayCallbacks;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private destroyed = false;
  private nodeId: string;
  private gatewayPort?: number;
  private securityTier: SecurityTier = 'standard';

  private ownPrivateKey: CryptoKey | null = null;
  private ownPublicJwk: JsonWebKey | null = null;
  private sharedKey: CryptoKey | null = null;
  private pendingOutbound: any[] = [];
  private pendingInbound: any[] = [];
  private minuteWindowStart = Date.now();
  private minuteCount = 0;

  constructor(apiKey: string, callbacks: RelayCallbacks, nodeId: string = 'node-1', gatewayPort?: number, securityTier: SecurityTier = 'standard') {
    this.apiKey = apiKey;
    this.callbacks = callbacks;
    this.nodeId = nodeId || 'node-1';
    this.gatewayPort = gatewayPort;
    this.securityTier = securityTier;
  }

  connect() {
    if (this.destroyed) return;
    if (this.ws) { this.ws.close(); this.ws = null; }

    this.sharedKey = null;
    this.pendingOutbound = [];
    this.pendingInbound = [];

    const url = `${RELAY_URL}?key=${encodeURIComponent(this.apiKey)}&nodeId=${encodeURIComponent(this.nodeId)}`;
    console.log('[Relay] Connecting to relay server...');
    this.ws = new WebSocket(url);

    this.ws.addEventListener('open', () => {
      console.log('[Relay] WebSocket open');
      this.ws?.send(JSON.stringify({ type: 'auth', key: this.apiKey, nodeId: this.nodeId, gatewayPort: this.gatewayPort, securityTier: this.securityTier }));
    });

    this.ws.addEventListener('message', async (ev) => {
      let msg: any;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }

      if (msg.type === 'relay.connected') {
        this.connected = true;
        console.log('[Relay] Authenticated, connected to relay');
        await this.startKeyExchange();
        return;
      }

      if (msg.type === 'relay.error') {
        console.error('[Relay] Error:', msg.message);
        return;
      }

      if (msg.type === 'relay.key_exchange' && msg.publicKey) {
        try {
          if (!this.ownPrivateKey) await this.startKeyExchange();
          if (this.ownPrivateKey) {
            this.sharedKey = await deriveSharedKey(this.ownPrivateKey, msg.publicKey);
            this.flushOutboundQueue();
            this.flushInboundQueue();
          }
        } catch (e) {
          console.error('[Relay] Key exchange failed:', e);
        }
        return;
      }

      const decrypted = await this.decryptPayload(msg);
      if (!decrypted) return;

      if (decrypted.type === 'relay.send') {
        if (!this.consumeRateLimit()) {
          this.send({ type: 'relay.chat_error', message: 'Rate limit exceeded', id: decrypted.id || '' });
          return;
        }
        this.callbacks.onWebMessage(decrypted.text || '', decrypted.id || '');
        return;
      }

      if (decrypted.type === 'relay.security_change') {
        this.send({
          type: 'relay.security_update',
          nodeId: this.nodeId,
          tier: decrypted.tier || this.securityTier,
          rateLimits: this.getRateLimitConfig(),
          gatewayPort: this.gatewayPort,
        });
        return;
      }

      if (decrypted.type === 'relay.abort') {
        this.callbacks.onWebAbort();
        return;
      }

      if (decrypted.type === 'relay.history_request') {
        this.callbacks.onWebHistoryRequest(decrypted.id || '');
        return;
      }

      if (decrypted.type === 'relay.schedule_tasks') {
        this.callbacks.onScheduleTasks?.(decrypted.projectName || '', decrypted.tasks || []);
        this.send({ type: 'relay.tasks_scheduled', projectName: decrypted.projectName });
        return;
      }

      if (decrypted.type === 'relay.pause_project') {
        this.callbacks.onPauseProject?.(decrypted.projectName || '');
        return;
      }

      if (decrypted.type === 'relay.stop_project') {
        this.callbacks.onStopProject?.(decrypted.projectName || '');
        return;
      }

      if (decrypted.type === 'relay.resume_project') {
        this.callbacks.onResumeProject?.(decrypted.projectName || '');
        return;
      }

      if (decrypted.type === 'relay.rpc_request' && decrypted.rpcId && decrypted.method) {
        const wsRequest = this.callbacks.getWsRequest?.();
        if (!wsRequest) {
          this.send({ type: 'relay.rpc_response', rpcId: decrypted.rpcId, error: 'Gateway not connected' });
          return;
        }
        wsRequest(decrypted.method, decrypted.params || {})
          .then((result: any) => this.send({ type: 'relay.rpc_response', rpcId: decrypted.rpcId, result }))
          .catch((err: any) => this.send({ type: 'relay.rpc_response', rpcId: decrypted.rpcId, error: err?.message || 'RPC failed' }));
      }
    });

    this.ws.addEventListener('close', () => {
      console.log('[Relay] Disconnected');
      this.connected = false;
      this.ws = null;
      if (!this.destroyed) this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    });

    this.ws.addEventListener('error', (ev) => {
      console.error('[Relay] WebSocket error:', ev);
    });
  }

  private getRateLimitConfig(): RateLimitConfig {
    try {
      const raw = localStorage.getItem(RATE_LIMITS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed[this.nodeId] || DEFAULT_RATE_LIMITS[this.securityTier] || DEFAULT_RATE_LIMITS.standard;
    } catch {
      return DEFAULT_RATE_LIMITS[this.securityTier] || DEFAULT_RATE_LIMITS.standard;
    }
  }

  private consumeRateLimit(): boolean {
    const limits = this.getRateLimitConfig();
    if (!limits?.enabled) return true;
    const now = Date.now();
    if (now - this.minuteWindowStart >= 60_000) {
      this.minuteWindowStart = now;
      this.minuteCount = 0;
    }
    if (this.minuteCount >= limits.maxCommandsPerMinute) return false;
    this.minuteCount += 1;
    return true;
  }

  private async startKeyExchange() {
    const kp = await generateKeyPair();
    this.ownPrivateKey = kp.privateKey;
    this.ownPublicJwk = kp.publicKey;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'relay.key_exchange', publicKey: kp.publicKey, sourceNodeId: this.nodeId }));
    }
  }

  private flushOutboundQueue() {
    if (!this.sharedKey || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const queued = [...this.pendingOutbound];
    this.pendingOutbound = [];
    queued.forEach((m) => this.send(m));
  }

  private async flushInboundQueue() {
    const queued = [...this.pendingInbound];
    this.pendingInbound = [];
    for (const m of queued) {
      const decrypted = await this.decryptPayload(m);
      if (!decrypted) continue;
      if (decrypted.type === 'relay.send') this.callbacks.onWebMessage(decrypted.text || '', decrypted.id || '');
      else if (decrypted.type === 'relay.abort') this.callbacks.onWebAbort();
      else if (decrypted.type === 'relay.history_request') this.callbacks.onWebHistoryRequest(decrypted.id || '');
    }
  }

  private async encryptPayload(msg: any): Promise<any | null> {
    if (!msg?.type?.startsWith('relay.')) return msg;
    if (msg.type === 'relay.key_exchange') return msg;

    const sensitive: Record<string, any> = {};
    for (const [k, v] of Object.entries(msg)) {
      if (!PLAIN_FIELDS.has(k)) sensitive[k] = v;
    }

    if (Object.keys(sensitive).length === 0) return msg;
    if (!this.sharedKey) return null;

    const encrypted = await encrypt(this.sharedKey, JSON.stringify(sensitive));
    const outbound: any = {};
    for (const [k, v] of Object.entries(msg)) {
      if (PLAIN_FIELDS.has(k)) outbound[k] = v;
    }
    outbound.encrypted = encrypted;
    return outbound;
  }

  private async decryptPayload(msg: any): Promise<any | null> {
    if (!msg?.encrypted) return msg;
    if (!this.sharedKey) {
      this.pendingInbound.push(msg);
      return null;
    }
    try {
      const plaintext = await decrypt(this.sharedKey, msg.encrypted);
      const parsed = JSON.parse(plaintext);
      return { ...msg, ...parsed, encrypted: undefined };
    } catch (e) {
      console.error('[Relay] Failed to decrypt payload:', e);
      return null;
    }
  }

  sendDelta(text: string) { this.send({ type: 'relay.chat_delta', text }); }
  sendFinal(text: string) { this.send({ type: 'relay.chat_final', text }); }
  sendError(message: string) { this.send({ type: 'relay.chat_error', message }); }
  sendHistory(id: string, messages: { role: string; content: string; timestamp?: number }[]) { this.send({ type: 'relay.history', id, messages }); }
  sendStatus(status: 'streaming' | 'idle') { this.send({ type: 'relay.status', status }); }

  get isConnected() { return this.connected; }

  private send(msg: any) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn('[RelayClient] Cannot send, ws state:', this.ws?.readyState);
      return;
    }

    const outboundBase = { ...msg, sourceNodeId: msg?.sourceNodeId || this.nodeId };
    this.encryptPayload(outboundBase)
      .then((enc) => {
        if (!enc) {
          this.pendingOutbound.push(msg);
          return;
        }
        console.log('[RelayClient] Sending:', enc.type);
        this.ws?.send(JSON.stringify(enc));
      })
      .catch((e) => console.error('[RelayClient] Send failed:', e));
  }

  destroy() {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) { this.ws.close(); this.ws = null; }
  }
}
