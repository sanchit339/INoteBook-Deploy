const express = require('express');
const router = express.Router();
const {
  getPublicKeySpkiBase64,
  decryptRequest,
  encryptResponse,
} = require('./resourceCrypto');

// Upstream source (server-side only — never exposed to clients)
const UPSTREAM_API = 'https://api.github.com';
const UPSTREAM_RAW = 'https://raw.githubusercontent.com';

/** Stay under Vercel Hobby ~4.5MB response after AES-GCM + base64. */
const MAX_IMAGE_BYTES = Math.floor(2.5 * 1024 * 1024);

const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  avif: 'image/avif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

const IMAGE_HOSTS = new Set([
  'raw.githubusercontent.com',
  'user-images.githubusercontent.com',
  'objects.githubusercontent.com',
  'media.githubusercontent.com',
  'camo.githubusercontent.com',
  'github.com',
]);

const noStore = (res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Content-Type-Options': 'nosniff',
  });
};

const upstreamHeaders = (extra = {}) => {
  const headers = {
    'User-Agent': 'ResourceProxy/1.0',
    ...extra,
  };
  if (process.env.GITHUB_TOKEN || process.env.RESOURCE_TOKEN) {
    headers.Authorization = `token ${process.env.GITHUB_TOKEN || process.env.RESOURCE_TOKEN}`;
  }
  return headers;
};

const throwUpstream = (status) => {
  const err = new Error('upstream');
  err.status = status;
  throw err;
};

const getExt = (filePath) => {
  const base = String(filePath || '').split('/').pop() || '';
  const i = base.lastIndexOf('.');
  if (i < 0) return '';
  return base.slice(i + 1).toLowerCase();
};

const isSafeSegment = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  !value.includes('/') &&
  !value.includes('\\') &&
  !value.includes('..') &&
  !value.includes('?') &&
  !value.includes('#');

/** Collapse `.` / `..` and reject escapes above repo root. */
const normalizeRepoPath = (filePath) => {
  const raw = String(filePath || '').replace(/\\/g, '/');
  const parts = [];
  for (const part of raw.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    if (part.includes('..')) return null;
    parts.push(part);
  }
  return parts.join('/') || null;
};

const encodeRepoPath = (filePath) =>
  String(filePath)
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');

const encodeBranch = (branch) =>
  String(branch)
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');

const buildRawUrl = (owner, name, branch, filePath) =>
  `${UPSTREAM_RAW}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${encodeBranch(branch)}/${encodeRepoPath(filePath)}`;

const resolveMime = (filePath, contentType) => {
  const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (ct.startsWith('image/')) return ct;
  return MIME_BY_EXT[getExt(filePath)] || ct || 'application/octet-stream';
};

/**
 * Allowlisted GitHub image hosts only (no open proxy).
 * github.com blob/raw URLs are rewritten to raw.githubusercontent.com.
 */
const rewriteGithubImageUrl = (urlStr) => {
  let u;
  try {
    u = new URL(String(urlStr));
  } catch (_) {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  if (!IMAGE_HOSTS.has(host)) return null;

  if (host === 'github.com') {
    const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/(blob|raw)\/([^/]+)\/(.+)$/);
    if (!m) return null;
    const filePath = normalizeRepoPath(m[5]);
    if (!isSafeSegment(m[1]) || !isSafeSegment(m[2]) || !isSafeSegment(m[4]) || !filePath) {
      return null;
    }
    return buildRawUrl(m[1], m[2], m[4], filePath);
  }

  if (host === 'raw.githubusercontent.com') {
    const parts = u.pathname.replace(/^\//, '').split('/');
    if (parts.length < 4) return null;
    const filePath = normalizeRepoPath(parts.slice(3).join('/'));
    if (!isSafeSegment(parts[0]) || !isSafeSegment(parts[1]) || !isSafeSegment(parts[2]) || !filePath) {
      return null;
    }
    return buildRawUrl(parts[0], parts[1], parts[2], filePath);
  }

  return `https://${host}${u.pathname}${u.search || ''}`;
};

const fetchUpstreamJson = async (url) => {
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'ResourceProxy/1.0',
  };

  if (process.env.GITHUB_TOKEN || process.env.RESOURCE_TOKEN) {
    headers.Authorization = `token ${process.env.GITHUB_TOKEN || process.env.RESOURCE_TOKEN}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const err = new Error('upstream');
    err.status = response.status;
    throw err;
  }
  return response.json();
};

const fetchUpstreamText = async (url) => {
  const headers = {
    'User-Agent': 'ResourceProxy/1.0',
  };

  if (process.env.GITHUB_TOKEN || process.env.RESOURCE_TOKEN) {
    headers.Authorization = `token ${process.env.GITHUB_TOKEN || process.env.RESOURCE_TOKEN}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const err = new Error('upstream');
    err.status = response.status;
    throw err;
  }
  return response.text();
};

const isAllowedImageHost = (hostname) => {
  const host = String(hostname || '').toLowerCase();
  return IMAGE_HOSTS.has(host) || host.endsWith('.githubusercontent.com');
};

const fetchUpstreamBinary = async (url) => {
  const response = await fetch(url, { headers: upstreamHeaders(), redirect: 'follow' });
  if (!response.ok) throwUpstream(response.status);

  try {
    const finalHost = new URL(response.url).hostname;
    if (!isAllowedImageHost(finalHost)) throwUpstream(400);
  } catch (err) {
    if (err && err.status) throw err;
    throwUpstream(400);
  }

  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
    throwUpstream(413);
  }

  const buf = Buffer.from(await response.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) throwUpstream(413);

  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim();
  return { buf, contentType };
};

const fetchImageResult = async ({ owner, name, branch, filePath, url }) => {
  let fetchUrl;
  let mimePath = filePath || '';

  if (url) {
    fetchUrl = rewriteGithubImageUrl(url);
    if (!fetchUrl) {
      const err = new Error('Invalid image url');
      err.status = 400;
      err.clientError = 'Invalid image url';
      throw err;
    }
    try {
      mimePath = decodeURIComponent(new URL(fetchUrl).pathname.split('/').pop() || '');
    } catch (_) {
      mimePath = '';
    }
  } else {
    fetchUrl = buildRawUrl(owner, name, branch, filePath);
    mimePath = filePath;
  }

  const { buf, contentType } = await fetchUpstreamBinary(fetchUrl);
  return {
    path: filePath || '',
    encoding: 'base64',
    mime: resolveMime(mimePath, contentType),
    content: buf.toString('base64'),
  };
};

const mapUpstreamError = (status) => {
  if (status === 404) return { status: 404, error: 'Project or resource not found' };
  if (status === 403) return { status: 403, error: 'Request limit exceeded. Try again later.' };
  if (status === 413) return { status: 413, error: 'Image is too large to load' };
  return { status: status || 502, error: 'Upstream resource error' };
};

/**
 * GET /api/resource/boot
 * Returns RSA public key for sealing an ephemeral AES session key.
 * Public key only — no project data.
 */
router.get('/boot', (req, res) => {
  try {
    noStore(res);
    res.json({
      v: 1,
      spki: getPublicKeySpkiBase64(),
    });
  } catch (error) {
    console.error('Resource boot error');
    res.status(500).json({ error: 'Boot failed' });
  }
});

/**
 * POST /api/resource/invoke
 * Opaque encrypted envelope. Network observers only see ciphertext blobs.
 *
 * Request:  { k, i, d }  — RSA-OAEP(AES key) + AES-GCM(request JSON)
 * Response: { i, d }     — AES-GCM(response JSON) with same AES key
 *
 * Request JSON ops:
 *   { op: 'project', owner, name }
 *   { op: 'tree', owner, name, branch? }
 *   { op: 'file', owner, name, branch, path }
 *   { op: 'image', owner, name, branch, path }  — binary (base64)
 *   { op: 'image', url }                        — allowlisted GitHub image CDN
 */
router.post('/invoke', async (req, res) => {
  noStore(res);

  let aesKey;
  try {
    const decrypted = decryptRequest(req.body);
    aesKey = decrypted.aesKey;
    const { payload } = decrypted;

    if (!payload || typeof payload.op !== 'string') {
      const enc = encryptResponse(aesKey, { error: 'Invalid operation' });
      return res.status(400).json(enc);
    }

    const op = payload.op;
    let result;

    if (op === 'project') {
      const { owner, name } = payload;
      if (!owner || !name) {
        const enc = encryptResponse(aesKey, { error: 'Invalid project path' });
        return res.status(400).json(enc);
      }
      const data = await fetchUpstreamJson(`${UPSTREAM_API}/repos/${owner}/${name}`);
      result = {
        name: data.name,
        fullName: data.full_name,
        description: data.description,
        defaultBranch: data.default_branch,
        language: data.language,
        stars: data.stargazers_count,
        forks: data.forks_count,
        isPrivate: data.private,
      };
    } else if (op === 'tree') {
      const { owner, name } = payload;
      let branch = payload.branch || 'main';
      if (!owner || !name) {
        const enc = encryptResponse(aesKey, { error: 'Invalid project path' });
        return res.status(400).json(enc);
      }
      if (!payload.branch || payload.branch === 'main') {
        const projectData = await fetchUpstreamJson(`${UPSTREAM_API}/repos/${owner}/${name}`);
        branch = projectData.default_branch || 'main';
      }
      const data = await fetchUpstreamJson(
        `${UPSTREAM_API}/repos/${owner}/${name}/git/trees/${branch}?recursive=1`
      );
      const tree = (data.tree || [])
        .filter((item) => item.type === 'blob' || item.type === 'tree')
        .map((item) => ({
          path: item.path,
          type: item.type === 'blob' ? 'file' : 'folder',
          size: item.size,
          sha: item.sha,
        }));
      result = { branch, tree };
    } else if (op === 'file') {
      const { owner, name, branch, path: filePath } = payload;
      if (!owner || !name || !branch || !filePath) {
        const enc = encryptResponse(aesKey, { error: 'Invalid file request' });
        return res.status(400).json(enc);
      }
      const content = await fetchUpstreamText(
        `${UPSTREAM_RAW}/${owner}/${name}/${branch}/${filePath}`
      );
      result = { path: filePath, content };
    } else if (op === 'image') {
      const { owner, name, branch, url } = payload;
      if (url) {
        result = await fetchImageResult({ url });
      } else {
        const filePath = normalizeRepoPath(payload.path);
        if (!owner || !name || !branch || !filePath) {
          const enc = encryptResponse(aesKey, { error: 'Invalid file request' });
          return res.status(400).json(enc);
        }
        result = await fetchImageResult({ owner, name, branch, filePath });
      }
    } else {
      const enc = encryptResponse(aesKey, { error: 'Unknown operation' });
      return res.status(400).json(enc);
    }

    return res.json(encryptResponse(aesKey, { ok: true, data: result }));
  } catch (error) {
    if (aesKey) {
      if (error && error.status) {
        const mapped = mapUpstreamError(error.status);
        const message = error.clientError || mapped.error;
        return res.status(mapped.status).json(encryptResponse(aesKey, { error: message }));
      }
      if (error && error.message === 'Malformed envelope') {
        return res.status(401).json({ error: 'Session expired', code: 'REBOOT' });
      }
      return res.status(500).json(encryptResponse(aesKey, { error: 'Internal server error' }));
    }
    // Could not open envelope — usually stale client key after serverless cold start
    return res.status(401).json({ error: 'Session expired', code: 'REBOOT' });
  }
});

// Reject legacy plain-text resource paths (no content on the wire in clear)
router.all(['/project/*', '/tree/*', '/file/*'], (req, res) => {
  noStore(res);
  res.status(410).json({ error: 'Gone' });
});

module.exports = router;
