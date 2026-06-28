const textEncoder = new TextEncoder();

export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function hashPassword(password: string): Promise<string> {
  const iterations = 120_000;
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2-sha256:${iterations}:${bytesToBase64Url(salt)}:${bytesToBase64Url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, iterationsText, saltText, hashText] = stored.split(':');
  if (algorithm !== 'pbkdf2-sha256' || !iterationsText || !saltText || !hashText) return false;

  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < 50_000) return false;

  const salt = base64UrlToBytes(saltText);
  const expected = base64UrlToBytes(hashText);
  const actual = await pbkdf2(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', textEncoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a[index] ^ b[index];
  }
  return mismatch === 0;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
