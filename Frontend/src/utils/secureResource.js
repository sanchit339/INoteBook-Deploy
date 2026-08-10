/**
 * Secure resource channel (memory-only session).
 *
 * - Ephemeral AES-256-GCM key lives only in RAM (never localStorage)
 * - AES key sealed to server with RSA-OAEP for each request
 * - Request + response bodies are ciphertext blobs
 * - Single opaque endpoint: POST /api/resource/invoke
 * - purgeSecureSession() wipes all secrets on tab close
 */

import { getApiBase } from './apiBase';

let serverSpki = null;
let serverPublicKey = null; // CryptoKey
let sessionAesKey = null; // CryptoKey
let sessionAesRaw = null; // ArrayBuffer (for re-export per request seal)
let bootPromise = null;

const b64ToBytes = (b64) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

const bytesToB64 = (bytes) => {
  const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < arr.length; i += chunk) {
    s += String.fromCharCode(...arr.subarray(i, i + chunk));
  }
  return btoa(s);
};

const importServerPublicKey = async (spkiB64) => {
  const spki = b64ToBytes(spkiB64);
  return window.crypto.subtle.importKey(
    'spki',
    spki,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
};

const ensureAesKey = async () => {
  if (sessionAesKey && sessionAesRaw) return;
  sessionAesKey = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  sessionAesRaw = await window.crypto.subtle.exportKey('raw', sessionAesKey);
};

const aesEncryptJson = async (obj) => {
  await ensureAesKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(obj));
  const ct = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sessionAesKey,
    plain
  );
  return {
    i: bytesToB64(iv),
    d: bytesToB64(ct),
  };
};

const aesDecryptJson = async (i, d) => {
  await ensureAesKey();
  const iv = b64ToBytes(i);
  const data = b64ToBytes(d);
  const plain = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sessionAesKey,
    data
  );
  return JSON.parse(new TextDecoder().decode(plain));
};

const sealAesKey = async () => {
  if (!serverPublicKey) throw new Error('Channel not ready');
  await ensureAesKey();
  const sealed = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    serverPublicKey,
    sessionAesRaw
  );
  return bytesToB64(sealed);
};

/**
 * Wipe all in-memory channel secrets. Call on pagehide / unmount.
 */
export const purgeSecureSession = () => {
  serverSpki = null;
  serverPublicKey = null;
  sessionAesKey = null;
  sessionAesRaw = null;
  bootPromise = null;
};

/**
 * Remove any leftover encrypted workspace blobs from older builds.
 */
export const scrubLegacyStorage = () => {
  if (typeof window === 'undefined') return;
  try {
    const lsKeys = Object.keys(localStorage);
    lsKeys.forEach((k) => {
      if (
        k.startsWith('cloudnote_encrypted_') ||
        k.includes('repositories') ||
        k.includes('encryption_key')
      ) {
        localStorage.removeItem(k);
      }
    });
    const ssKeys = Object.keys(sessionStorage);
    ssKeys.forEach((k) => {
      if (
        k.startsWith('cloudnote_') ||
        k.includes('encryption') ||
        k.includes('repositories')
      ) {
        sessionStorage.removeItem(k);
      }
    });
  } catch (_) {
    // ignore
  }
};

/**
 * Boot encrypted channel (fetch server public key, create ephemeral AES key).
 */
export const bootSecureChannel = async () => {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error('Secure channel unavailable');
  }
  if (serverPublicKey && sessionAesKey) return true;

  if (!bootPromise) {
    bootPromise = (async () => {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/resource/boot`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error('Secure channel boot failed');
      const json = await res.json();
      if (!json?.spki) throw new Error('Secure channel boot failed');
      serverSpki = json.spki;
      serverPublicKey = await importServerPublicKey(serverSpki);
      await ensureAesKey();
      return true;
    })().catch((err) => {
      bootPromise = null;
      purgeSecureSession();
      throw err;
    });
  }
  return bootPromise;
};

/**
 * Invoke an opaque encrypted resource operation.
 * @param {'project'|'tree'|'file'} op
 * @param {object} args
 */
export const secureInvoke = async (op, args = {}) => {
  await bootSecureChannel();

  const envelopeInner = await aesEncryptJson({ op, ...args });
  const k = await sealAesKey();

  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/api/resource/invoke`, {
    method: 'POST',
    cache: 'no-store',
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      k,
      i: envelopeInner.i,
      d: envelopeInner.d,
    }),
  });

  const raw = await res.json().catch(() => null);
  if (!raw || !raw.i || !raw.d) {
    throw new Error(raw?.error || 'Secure channel error');
  }

  let payload;
  try {
    payload = await aesDecryptJson(raw.i, raw.d);
  } catch (_) {
    // Server may have rotated RSA on cold start — re-boot once and retry
    purgeSecureSession();
    await bootSecureChannel();
    const retryInner = await aesEncryptJson({ op, ...args });
    const retryK = await sealAesKey();
    const retryRes = await fetch(`${apiBase}/api/resource/invoke`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        k: retryK,
        i: retryInner.i,
        d: retryInner.d,
      }),
    });
    const retryRaw = await retryRes.json().catch(() => null);
    if (!retryRaw?.i || !retryRaw?.d) {
      throw new Error(retryRaw?.error || 'Secure channel error');
    }
    payload = await aesDecryptJson(retryRaw.i, retryRaw.d);
    if (!retryRes.ok || payload?.error) {
      throw new Error(payload?.error || 'Request failed');
    }
    return payload.data;
  }

  if (!res.ok || payload?.error) {
    throw new Error(payload?.error || 'Request failed');
  }
  return payload.data;
};

export const isSecureChannelReady = () =>
  Boolean(serverPublicKey && sessionAesKey);
