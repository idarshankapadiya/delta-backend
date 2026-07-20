import { getCorsOrigins } from './origin.config';

type CorsOriginCallback = (error: Error | null, allow: boolean) => void;

export const corsAllowedMethods = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'DELETE',
  'OPTIONS',
];

export function handleCorsOrigin(
  origin: string | undefined,
  callback: CorsOriginCallback,
): void {
  callback(null, !origin || getCorsOrigins().includes(origin));
}
