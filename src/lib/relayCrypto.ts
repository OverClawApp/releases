const subtle = globalThis.crypto?.subtle;

function ensureSubtle() {
  if (!subtle) throw new Error('Web Crypto API unavailable');
  return subtle;
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(base64, 'base64'));
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function generateKeyPair(): Promise<{ publicKey: JsonWebKey; privateKey: CryptoKey }> {
  const kp = await ensureSubtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  const publicKey = await ensureSubtle().exportKey('jwk', kp.publicKey);
  return { publicKey, privateKey: kp.privateKey };
}

export async function deriveSharedKey(privateKey: CryptoKey, peerPublicKey: JsonWebKey): Promise<CryptoKey> {
  const importedPeer = await ensureSubtle().importKey(
    'jwk',
    peerPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  return ensureSubtle().deriveKey(
    { name: 'ECDH', public: importedPeer },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encrypt(key: CryptoKey, plaintext: string): Promise<{ iv: string; ct: string }> {
  const iv = new Uint8Array(toArrayBuffer(crypto.getRandomValues(new Uint8Array(12))));
  const pt = new TextEncoder().encode(plaintext);
  const encrypted = await ensureSubtle().encrypt({ name: 'AES-GCM', iv }, key, toArrayBuffer(pt));
  return { iv: toBase64(iv), ct: toBase64(new Uint8Array(encrypted)) };
}

export async function decrypt(key: CryptoKey, encrypted: { iv: string; ct: string }): Promise<string> {
  const iv = new Uint8Array(toArrayBuffer(fromBase64(encrypted.iv)));
  const ct = fromBase64(encrypted.ct);
  const pt = await ensureSubtle().decrypt({ name: 'AES-GCM', iv }, key, toArrayBuffer(ct));
  return new TextDecoder().decode(pt);
}
