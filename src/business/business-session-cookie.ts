import type { FastifyReply, FastifyRequest } from 'fastify';

const productionCookieName = '__Host-business_session';
const developmentCookieName = 'business_session';
const maxAgeSeconds = 30 * 24 * 60 * 60;

export function getBusinessSessionCookieName(): string {
  return process.env.NODE_ENV === 'production'
    ? productionCookieName
    : developmentCookieName;
}

export function getBusinessSessionToken(
  request: FastifyRequest,
): string | undefined {
  return request.cookies?.[getBusinessSessionCookieName()];
}

export function setBusinessSessionCookie(
  reply: FastifyReply,
  token: string,
): void {
  reply.setCookie(getBusinessSessionCookieName(), token, {
    httpOnly: true,
    maxAge: maxAgeSeconds,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

export function clearBusinessSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(getBusinessSessionCookieName(), {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}
