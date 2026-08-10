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

const noStore = (res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Content-Type-Options': 'nosniff',
  });
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

const mapUpstreamError = (status) => {
  if (status === 404) return { status: 404, error: 'Project or resource not found' };
  if (status === 403) return { status: 403, error: 'Request limit exceeded. Try again later.' };
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
    } else {
      const enc = encryptResponse(aesKey, { error: 'Unknown operation' });
      return res.status(400).json(enc);
    }

    return res.json(encryptResponse(aesKey, { ok: true, data: result }));
  } catch (error) {
    if (aesKey) {
      if (error && error.status) {
        const mapped = mapUpstreamError(error.status);
        return res.status(mapped.status).json(encryptResponse(aesKey, { error: mapped.error }));
      }
      if (error && error.message === 'Malformed envelope') {
        return res.status(400).json({ error: 'Bad request' });
      }
      return res.status(500).json(encryptResponse(aesKey, { error: 'Internal server error' }));
    }
    // Could not open envelope — return generic opaque error (no details)
    return res.status(400).json({ error: 'Bad request' });
  }
});

// Reject legacy plain-text resource paths (no content on the wire in clear)
router.all(['/project/*', '/tree/*', '/file/*'], (req, res) => {
  noStore(res);
  res.status(410).json({ error: 'Gone' });
});

module.exports = router;
