const PROD_BACKEND = 'https://i-note-book-deploy-backend.vercel.app';

const trimTrailingSlash = (value) => value.replace(/\/+$/, '');

export const getApiBase = () => {
  const envUrl = process.env.REACT_APP_API_URL || process.env.REACT_APP_BACKEND_URL || '';
  const cleanedEnvUrl = envUrl ? trimTrailingSlash(envUrl) : '';

  if (cleanedEnvUrl) {
    if (
      cleanedEnvUrl.includes('i-note-book-deploy.vercel.app') &&
      !cleanedEnvUrl.includes('i-note-book-deploy-backend.vercel.app')
    ) {
      return PROD_BACKEND;
    }
    return cleanedEnvUrl;
  }

  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    return 'http://localhost:4001';
  }

  return PROD_BACKEND;
};
