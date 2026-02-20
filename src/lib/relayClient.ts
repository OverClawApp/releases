/**
 * RelayClient — connects the desktop app to the Railway relay server.
 * 
 * When the website sends a message via the relay, this client:
 * 1. Receives it from Railway WebSocket
 * 2. Injects it into the local GatewayChat via the provided callback
 * 3. Forwards streaming responses back to Railway → website
 */

const RELAY_URL = 'wss://overclaw-api-production.up.railway.app/ws/device';

export interface ProjectTask {
  title: string;
  description: string;
  estimatedMinutes: number;
  dependencies: number[];
  index: number;
}

export type WsRequest = (method: string, params: any) => Promise<any>;

export interface RelayCallbacks {
  /** Called when a web user sends a chat message */
  onWebMessage: (text: string, id: string) => void;
  /** Called when web user requests chat abort */
  onWebAbort: () => void;
  /** Called when web user requests chat history */
  onWebHistoryRequest: (id: string) => void;
  /** Called when web user schedules project tasks */
  onScheduleTasks?: (projectName: string, tasks: ProjectTask[]) => void;
  /** Called when web user pauses a project */
  onPauseProject?: (projectName: string) => void;
  /** Called when web user stops a project */
  onStopProject?: (projectName: string) => void;
  /** Called when web user resumes a project */
  onResumeProject?: (projectName: string) => void;
  /** Gateway WS request function for RPC forwarding */
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

  constructor(apiKey: string, callbacks: RelayCallbacks, nodeId: string = 'node-1') {
    this.apiKey = apiKey;
    this.callbacks = callbacks;
    this.nodeId = nodeId || 'node-1';
  }

  connect() {
    if (this.destroyed) return;
    if (this.ws) { this.ws.close(); this.ws = null; }

    const url = `${RELAY_URL}?key=${encodeURIComponent(this.apiKey)}&nodeId=${encodeURIComponent(this.nodeId)}`;
    console.log('[Relay] Connecting to relay server...');
    this.ws = new WebSocket(url);

    this.ws.addEventListener('open', () => {
      console.log('[Relay] WebSocket open');
      this.ws?.send(JSON.stringify({ type: 'auth', key: this.apiKey, nodeId: this.nodeId }));
    });

    this.ws.addEventListener('message', (ev) => {
      let msg: any;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }

      if (msg.type === 'relay.connected') {
        this.connected = true;
        console.log('[Relay] Authenticated, connected to relay');
        return;
      }

      if (msg.type === 'relay.error') {
        console.error('[Relay] Error:', msg.message);
        return;
      }

      // Web client sent a chat message
      if (msg.type === 'relay.send') {
        this.callbacks.onWebMessage(msg.text || '', msg.id || '');
        return;
      }

      // Web client wants to abort
      if (msg.type === 'relay.abort') {
        this.callbacks.onWebAbort();
        return;
      }

      // Web client wants history
      if (msg.type === 'relay.history_request') {
        this.callbacks.onWebHistoryRequest(msg.id || '');
        return;
      }

      // Project task scheduling
      if (msg.type === 'relay.schedule_tasks') {
        this.callbacks.onScheduleTasks?.(msg.projectName || '', msg.tasks || []);
        this.send({ type: 'relay.tasks_scheduled', projectName: msg.projectName });
        return;
      }

      if (msg.type === 'relay.pause_project') {
        this.callbacks.onPauseProject?.(msg.projectName || '');
        return;
      }

      if (msg.type === 'relay.stop_project') {
        this.callbacks.onStopProject?.(msg.projectName || '');
        return;
      }

      if (msg.type === 'relay.resume_project') {
        this.callbacks.onResumeProject?.(msg.projectName || '');
        return;
      }

      // RPC forwarding — website calls gateway methods through relay
      if (msg.type === 'relay.rpc_request' && msg.rpcId && msg.method) {
        const wsRequest = this.callbacks.getWsRequest?.();
        if (!wsRequest) {
          this.send({ type: 'relay.rpc_response', rpcId: msg.rpcId, error: 'Gateway not connected' });
          return;
        }
        wsRequest(msg.method, msg.params || {})
          .then((result: any) => {
            this.send({ type: 'relay.rpc_response', rpcId: msg.rpcId, result });
          })
          .catch((err: any) => {
            this.send({ type: 'relay.rpc_response', rpcId: msg.rpcId, error: err?.message || 'RPC failed' });
          });
        return;
      }
    });

    this.ws.addEventListener('close', () => {
      console.log('[Relay] Disconnected');
      this.connected = false;
      this.ws = null;
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => this.connect(), 5000);
      }
    });

    this.ws.addEventListener('error', (ev) => {
      console.error('[Relay] WebSocket error:', ev);
    });
  }

  /** Send a streaming delta to the website */
  sendDelta(text: string) {
    this.send({ type: 'relay.chat_delta', text });
  }

  /** Send the final complete response to the website */
  sendFinal(text: string) {
    this.send({ type: 'relay.chat_final', text });
  }

  /** Send an error to the website */
  sendError(message: string) {
    this.send({ type: 'relay.chat_error', message });
  }

  /** Send chat history to the website */
  sendHistory(id: string, messages: { role: string; content: string; timestamp?: number }[]) {
    this.send({ type: 'relay.history', id, messages });
  }

  /** Send status update */
  sendStatus(status: 'streaming' | 'idle') {
    this.send({ type: 'relay.status', status });
  }

  get isConnected() { return this.connected; }

  private send(msg: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const outbound = { ...msg, sourceNodeId: msg?.sourceNodeId || this.nodeId };
      console.log('[RelayClient] Sending:', outbound.type)
      this.ws.send(JSON.stringify(outbound));
    } else {
      console.warn('[RelayClient] Cannot send, ws state:', this.ws?.readyState)
    }
  }

  destroy() {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) { this.ws.close(); this.ws = null; }
  }
}
