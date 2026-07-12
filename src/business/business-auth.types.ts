import type { FastifyRequest } from 'fastify';

export type BusinessRole = 'business_admin';

export interface BusinessIdentity {
  email: string;
  hostedDomain?: string;
  name: string;
  subject: string;
}

export interface BusinessUser {
  email: string;
  name: string;
  role: BusinessRole;
  status: 'active' | 'disabled';
  subject: string;
}

export interface StoredBusinessSession {
  createdAt: Date;
  email: string;
  expiresAt: Date;
  graceExpiresAt?: Date;
  idleExpiresAt: Date;
  lastSeenAt: Date;
  name: string;
  replacedByHash?: string;
  revokedAt?: Date;
  role: BusinessRole;
  rotateAfter: Date;
  subject: string;
}

export interface AuthenticatedBusinessSession extends StoredBusinessSession {
  tokenHash: string;
}

export interface BusinessAuthRequest extends FastifyRequest {
  businessSession?: AuthenticatedBusinessSession;
}

export interface BusinessRequestContext {
  ip: string;
  path?: string;
  userAgent?: string;
}
