import { getApiBase } from './apiBase';

const safe = (value, max = 250) => String(value ?? '').slice(0, max);

export const logClientEvent = async ({ level = 'info', event, message = '', meta = {} }) => {
  try {
    const apiBase = getApiBase();
    const endpoint = `${apiBase}/api/logs/client`;
    const payload = {
      level: safe(level, 16),
      event: safe(event, 64),
      message: safe(message, 500),
      meta: {
        ...meta,
        page: typeof window !== 'undefined' ? window.location.pathname : '',
        ts: new Date().toISOString(),
      },
    };

    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch (_) {
    // no-op: logging must never break product flows
  }
};
