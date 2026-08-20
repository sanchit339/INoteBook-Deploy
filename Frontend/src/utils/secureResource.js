/**
 * Secure resource channel (memory-only session).
 *
 * - Ephemeral AES-256-GCM key lives only in RAM (never localStorage)
 * - AES key sealed to server with RSA-OAEP for each request
 * - Request + response bodies are ciphertext blobs
 * - Single opaque endpoint: POST /api/resource/invoke
 * - Auto re-handshake when serverless rotates keys after idle/cold start
 * - purgeSecureSession() wipes all secrets on tab close
 */

import { getApiBase } from './apiBase';

let serverSpki = null;
let serverPublicKey = null; // CryptoKey
let sessionAesKey = null; // CryptoKey
let sessionAesRaw = null; // ArrayBuffer (for re-export per request seal)
let bootPromise = null;
let bootedAt = 0;

/** Re-fetch server public key periodically (Vercel instances can recycle). */
const BOOT_MAX_AGE_MS = 4 * 60 * 1000;

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
  if (!serverPublicKey) throw new Error('Connection unavailable');
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
  bootedAt = 0;
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

const isBootFresh = () =>
  Boolean(serverPublicKey && sessionAesKey && Date.now() - bootedAt < BOOT_MAX_AGE_MS);

/**
 * Boot channel (fetch server public key, create ephemeral AES key).
 * @param {boolean} force - always re-handshake (after idle / server recycle)
 */
export const bootSecureChannel = async (force = false) => {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error('Connection unavailable');
  }

  if (!force && isBootFresh()) return true;

  if (force || !isBootFresh()) {
    // Drop stale keys so we don't seal to an old public key after cold start
    serverSpki = null;
    serverPublicKey = null;
    sessionAesKey = null;
    sessionAesRaw = null;
    bootPromise = null;
    bootedAt = 0;
  }

  if (!bootPromise) {
    bootPromise = (async () => {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/resource/boot`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error('Connection failed');
      const json = await res.json();
      if (!json?.spki) throw new Error('Connection failed');
      serverSpki = json.spki;
      serverPublicKey = await importServerPublicKey(serverSpki);
      await ensureAesKey();
      bootedAt = Date.now();
      return true;
    })().catch((err) => {
      bootPromise = null;
      purgeSecureSession();
      throw err;
    });
  }
  return bootPromise;
};

const needsReboot = (res, raw, decryptFailed = false) => {
  if (decryptFailed) return true;
  if (!raw) return true;
  if (raw.code === 'REBOOT') return true;
  if (res && (res.status === 401 || res.status === 409)) return true;
  // Envelope could not be opened after server key rotation
  if (!raw.i || !raw.d) {
    const msg = String(raw.error || '').toLowerCase();
    if (
      !raw.error ||
      msg.includes('bad request') ||
      msg.includes('session') ||
      msg.includes('expired') ||
      msg.includes('gone')
    ) {
      return true;
    }
  }
  return false;
};

const postInvokeOnce = async (op, args) => {
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
  return { res, raw };
};

const unwrapResponse = async (res, raw) => {
  if (!raw || !raw.i || !raw.d) {
    const err = new Error(raw?.error || 'Request failed');
    err.reboot = needsReboot(res, raw);
    throw err;
  }

  let payload;
  try {
    payload = await aesDecryptJson(raw.i, raw.d);
  } catch (_) {
    const err = new Error('Request failed');
    err.reboot = true;
    throw err;
  }

  if (payload?.code === 'REBOOT') {
    const err = new Error(payload.error || 'Request failed');
    err.reboot = true;
    throw err;
  }

  if (!res.ok || payload?.error) {
    const err = new Error(payload?.error || 'Request failed');
    err.reboot = needsReboot(res, raw);
    throw err;
  }

  return payload.data;
};

/**
 * Invoke an opaque encrypted resource operation.
 * Automatically re-handshakes once if the server recycled after idle.
 * @param {'project'|'tree'|'file'|'image'} op
 * @param {object} args
 */
export const secureInvoke = async (op, args = {}) => {
  try {
    const { res, raw } = await postInvokeOnce(op, args);
    return await unwrapResponse(res, raw);
  } catch (firstErr) {
    if (!firstErr?.reboot) {
      throw firstErr;
    }

    // Serverless cold start / idle recycle: new RSA key — re-boot and retry once
    await bootSecureChannel(true);
    try {
      const { res, raw } = await postInvokeOnce(op, args);
      return await unwrapResponse(res, raw);
    } catch (secondErr) {
      // Don't surface "Bad request" — user-friendly after idle
      const msg = String(secondErr?.message || '');
      if (
        !msg ||
        /bad request|session|expired|reboot|connection/i.test(msg)
      ) {
        throw new Error('Connection lost. Please try again.');
      }
      throw secondErr;
    }
  }
};

export const isSecureChannelReady = () => isBootFresh();
