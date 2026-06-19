export function getAllowedFrontendOrigins(): string[] {
  return (process.env.FRONTEND_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getHttpHost(): string {
  return process.env.HOST?.trim() || '0.0.0.0';
}

export function getHttpPort(): number {
  const port = Number(process.env.PORT ?? 3000);
  return Number.isFinite(port) && port > 0 ? Math.floor(port) : 3000;
}
