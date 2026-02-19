// API base URL — local dev proxies to :3001, production points to Railway
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}
