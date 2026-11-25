import type { Env } from './types';

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 天有效期

interface TokenPayload {
  role: 'admin';
  iat: number;
  exp: number;
}

function getSigningSecret(env: Env): string {
  if (env.TOKEN_SECRET) return env.TOKEN_SECRET;
  if (env.ADMIN_PASSWORD) return `derived:${env.ADMIN_PASSWORD}`;
  throw new Error('Server misconfigured: ADMIN_PASSWORD or TOKEN_SECRET must be set');
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): Uint8Array<ArrayBuffer> | null {
  try {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * 常量时间字符串比较，避免时序侧信道
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const maxLen = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < maxLen; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

export async function issueAdminToken(env: Env): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    role: 'admin',
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payloadB64 = toBase64Url(payloadBytes);

  const key = await importHmacKey(getSigningSecret(env));
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const sigB64 = toBase64Url(new Uint8Array(sigBuf));

  return {
    token: `${payloadB64}.${sigB64}`,
    expiresAt: payload.exp * 1000,
  };
}

export async function verifyAdminRequest(request: Request, env: Env): Promise<boolean> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.slice(7).trim();
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return false;

  const payloadB64 = token.slice(0, dotIdx);
  const sigB64 = token.slice(dotIdx + 1);
  const sigBytes = fromBase64Url(sigB64);
  if (!sigBytes) return false;

  const key = await importHmacKey(getSigningSecret(env));
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes,
    new TextEncoder().encode(payloadB64)
  );
  if (!valid) return false;

  const payloadBytes = fromBase64Url(payloadB64);
  if (!payloadBytes) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as TokenPayload;
    const now = Math.floor(Date.now() / 1000);
    return payload.role === 'admin' && typeof payload.exp === 'number' && payload.exp > now;
  } catch {
    return false;
  }
}
