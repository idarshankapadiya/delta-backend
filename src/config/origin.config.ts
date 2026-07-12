const defaultPublicOrigin = 'https://darshanent.co.in';
const defaultBusinessOrigin = 'https://business.darshanent.co.in';

function parseOrigins(value: string | undefined, fallback: string): string[] {
  const origins = (value ?? fallback)
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (process.env.NODE_ENV !== 'production') {
    origins.push(
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5174',
    );
  }

  return [...new Set(origins)];
}

export function getPublicSiteOrigins(): string[] {
  return parseOrigins(
    process.env.PUBLIC_FRONTEND_ORIGIN ?? process.env.FRONTEND_ORIGIN,
    defaultPublicOrigin,
  );
}

export function getBusinessSiteOrigins(): string[] {
  return parseOrigins(
    process.env.BUSINESS_FRONTEND_ORIGIN,
    defaultBusinessOrigin,
  );
}

export function getCorsOrigins(): string[] {
  return [...new Set([...getPublicSiteOrigins(), ...getBusinessSiteOrigins()])];
}
