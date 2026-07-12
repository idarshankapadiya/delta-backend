import type { FastifyRequest } from 'fastify';

export function getClientIp(request: FastifyRequest): string {
  const forwardedFor = request.headers['x-forwarded-for'];
  const firstForwarded = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(',')[0];

  return firstForwarded?.trim() || request.ip || 'unknown';
}

export function getUserAgent(request: FastifyRequest): string | undefined {
  const userAgent: unknown = request.headers['user-agent'];

  if (typeof userAgent === 'string') {
    return userAgent;
  }

  return Array.isArray(userAgent) && typeof userAgent[0] === 'string'
    ? userAgent[0]
    : undefined;
}
