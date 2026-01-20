/**
 * Encryption Utilities for Browser Storage
 * Uses AES-256-GCM encryption to protect sensitive data from IT security inspection
 * 
 * Security Features:
 * - AES-256-GCM encryption (military-grade)
 * - Random IV (Initialization Vector) for each encryption
 * - Session-based key storage (cleared on browser close)
 * - No data persistence across browser restarts (intentional security feature)
 */

const ENCRYPTION_KEY_NAME = 'cloudnote_encryption_key';
const STORAGE_KEY_PREFIX = 'cloudnote_encrypted_';

/**
 * Check if we're in a browser environment
 */
const isBrowser = () => typeof window !== 'undefined';

/**
 * Generate a random AES-256 encryption key
 * @returns {Promise<CryptoKey>} AES-GCM encryption key
 */
export const generateEncryptionKey = async () => {
    if (!isBrowser()) return null;

    const key = await window.crypto.subtle.generateKey(
        {
            name: 'AES-GCM',
            length: 256, // 256-bit key for maximum security
        },
        true, // extractable
        ['encrypt', 'decrypt']
    );
    return key;
};

/**
 * Store encryption key in sessionStorage
 * Note: sessionStorage is cleared when browser/tab closes - this is intentional for security
 * @param {CryptoKey} key - The encryption key to store
 */
export const storeEncryptionKey = async (key) => {
    if (!isBrowser()) return;

    try {
        const exported = await window.crypto.subtle.exportKey('jwk', key);
        sessionStorage.setItem(ENCRYPTION_KEY_NAME, JSON.stringify(exported));
    } catch (error) {
        console.error('Failed to store encryption key:', error);
        throw new Error('Failed to store encryption key');
    }
};

/**
 * Retrieve encryption key from sessionStorage
 * @returns {Promise<CryptoKey|null>} The encryption key or null if not found
 */
export const getEncryptionKey = async () => {
    if (!isBrowser()) return null;

    try {
        const stored = sessionStorage.getItem(ENCRYPTION_KEY_NAME);
        if (!stored) return null;

        const jwk = JSON.parse(stored);
        const key = await window.crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
        return key;
    } catch (error) {
        console.error('Failed to retrieve encryption key:', error);
        return null;
    }
};

/**
 * Initialize or retrieve encryption key
 * @returns {Promise<CryptoKey>} The encryption key
 */
export const initializeEncryption = async () => {
    if (!isBrowser()) return null;

    let key = await getEncryptionKey();
    if (!key) {
        key = await generateEncryptionKey();
        await storeEncryptionKey(key);
    }
    return key;
};

/**
 * Encrypt data using AES-256-GCM
 * @param {any} data - Data to encrypt (will be JSON stringified)
 * @returns {Promise<string>} Base64 encoded encrypted data
 */
export const encryptData = async (data) => {
    if (!isBrowser()) return null;

    try {
        const key = await initializeEncryption();
        if (!key) return null;

        // Convert data to JSON string then to ArrayBuffer
        const jsonString = JSON.stringify(data);
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(jsonString);

        // Generate random IV (Initialization Vector)
        const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 12 bytes for GCM

        // Encrypt the data
        const encryptedBuffer = await window.crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv,
            },
            key,
            dataBuffer
        );

        // Combine IV and encrypted data
        const encryptedArray = new Uint8Array(encryptedBuffer);
        const combined = new Uint8Array(iv.length + encryptedArray.length);
        combined.set(iv, 0);
        combined.set(encryptedArray, iv.length);

        // Convert to base64 for storage
        return btoa(String.fromCharCode(...combined));
    } catch (error) {
        console.error('Encryption failed:', error);
        throw new Error('Failed to encrypt data');
    }
};

/**
 * Decrypt data using AES-256-GCM
 * @param {string} encryptedData - Base64 encoded encrypted data
 * @returns {Promise<any>} Decrypted and parsed data
 */
export const decryptData = async (encryptedData) => {
    if (!isBrowser()) return null;

    try {
        const key = await getEncryptionKey();
        if (!key) {
            throw new Error('No encryption key found');
        }

        // Convert from base64
        const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

        // Extract IV and encrypted data
        const iv = combined.slice(0, 12);
        const encryptedBuffer = combined.slice(12);

        // Decrypt the data
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv,
            },
            key,
            encryptedBuffer
        );

        // Convert back to JSON
        const decoder = new TextDecoder();
        const jsonString = decoder.decode(decryptedBuffer);
        return JSON.parse(jsonString);
    } catch (error) {
        console.error('Decryption failed:', error);
        throw new Error('Failed to decrypt data');
    }
};

/**
 * Save encrypted data to localStorage
 * @param {string} key - Storage key (will be prefixed)
 * @param {any} data - Data to encrypt and store
 */
export const saveEncrypted = async (key, data) => {
    if (!isBrowser()) return;

    try {
        const encrypted = await encryptData(data);
        if (encrypted) {
            localStorage.setItem(`${STORAGE_KEY_PREFIX}${key}`, encrypted);
        }
    } catch (error) {
        console.error('Failed to save encrypted data:', error);
        throw error;
    }
};

/**
 * Load and decrypt data from localStorage
 * @param {string} key - Storage key (will be prefixed)
 * @returns {Promise<any|null>} Decrypted data or null if not found
 */
export const loadEncrypted = async (key) => {
    if (!isBrowser()) return null;

    try {
        const encrypted = localStorage.getItem(`${STORAGE_KEY_PREFIX}${key}`);
        if (!encrypted) return null;

        return await decryptData(encrypted);
    } catch (error) {
        console.error('Failed to load encrypted data:', error);
        // If decryption fails, clear the corrupted data
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}${key}`);
        return null;
    }
};

/**
 * Clear encryption key (call on logout or when user wants to clear session)
 */
export const clearEncryptionKey = () => {
    if (!isBrowser()) return;
    sessionStorage.removeItem(ENCRYPTION_KEY_NAME);
};

/**
 * Clear all encrypted data from localStorage
 */
export const clearAllEncryptedData = () => {
    if (!isBrowser()) return;

    const keys = Object.keys(localStorage);
    keys.forEach(key => {
        if (key.startsWith(STORAGE_KEY_PREFIX)) {
            localStorage.removeItem(key);
        }
    });
};

/**
 * Check if encryption is available and initialized
 * @returns {Promise<boolean>} True if encryption is ready
 */
export const isEncryptionAvailable = async () => {
    if (!isBrowser()) return false;

    try {
        if (!window.crypto || !window.crypto.subtle) {
            return false;
        }
        const key = await getEncryptionKey();
        return key !== null;
    } catch (error) {
        return false;
    }
};
