const trimTrailingSlash = (value) => value.replace(/\/+$/, '');

export const getApiBase = () => {
  const envUrl = process.env.REACT_APP_API_URL || process.env.REACT_APP_BACKEND_URL || '';
  const cleanedEnvUrl = envUrl ? trimTrailingSlash(envUrl) : '';

  if (cleanedEnvUrl) {
    return cleanedEnvUrl;
  }

  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    return 'http://localhost:4001';
  }

  // In deployed frontend, prefer same-origin /api with Vercel rewrite to avoid browser CORS.
  return '';
};
