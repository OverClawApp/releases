export function getOrCreateGatewayPort(storageKey: string, defaultPort?: number): number {
  const stored = localStorage.getItem(storageKey);
  if (stored) return parseInt(stored, 10);
  const port = defaultPort || (10000 + Math.floor(Math.random() * 55000));
  localStorage.setItem(storageKey, String(port));
  return port;
}
