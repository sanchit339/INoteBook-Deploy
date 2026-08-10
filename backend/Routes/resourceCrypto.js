const crypto = require('crypto');

/** In-memory RSA keypair (regenerated on cold start; client re-boots). */
let keyPair = null;

const getKeyPair = () => {
  if (keyPair) return keyPair;

  if (process.env.RESOURCE_RSA_PRIVATE) {
    const privateKey = crypto.createPrivateKey(process.env.RESOURCE_RSA_PRIVATE);
    const publicKey = crypto.createPublicKey(privateKey);
    keyPair = { privateKey, publicKey };
    return keyPair;
  }

  // KeyObjects (no encoding) — works with privateDecrypt / export
  keyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  return keyPair;
};

const getPublicKeySpkiBase64 = () => {
  const { publicKey } = getKeyPair();
  return publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
};

const decryptAesKey = (encryptedKeyB64) => {
  const { privateKey } = getKeyPair();
  const buf = Buffer.from(encryptedKeyB64, 'base64');
  return crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    buf
  );
};

/** WebCrypto AES-GCM ciphertext includes 16-byte tag at end. */
const aesGcmDecrypt = (aesKey, ivB64, dataB64) => {
  const iv = Buffer.from(ivB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  if (data.length < 17) throw new Error('Invalid ciphertext');
  const tag = data.subarray(data.length - 16);
  const enc = data.subarray(0, data.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
};

const aesGcmEncrypt = (aesKey, obj) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const plain = Buffer.from(JSON.stringify(obj), 'utf8');
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([enc, tag]);
  return {
    i: iv.toString('base64'),
    d: combined.toString('base64'),
  };
};

const decryptRequest = (body) => {
  if (!body || !body.k || !body.i || !body.d) {
    throw new Error('Malformed envelope');
  }
  const aesKey = decryptAesKey(body.k);
  if (aesKey.length !== 32) {
    throw new Error('Invalid session key');
  }
  const payload = aesGcmDecrypt(aesKey, body.i, body.d);
  return { aesKey, payload };
};

const encryptResponse = (aesKey, obj) => aesGcmEncrypt(aesKey, obj);

module.exports = {
  getPublicKeySpkiBase64,
  decryptRequest,
  encryptResponse,
};
