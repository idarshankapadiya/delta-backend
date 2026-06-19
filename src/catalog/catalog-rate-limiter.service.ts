import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface RateWindow {
  count: number;
  resetAt: number;
}

@Injectable()
export class CatalogRateLimiterService {
  private readonly windows = new Map<string, RateWindow>();

  assertAllowed(
    key: string,
    limit: number,
    windowMs: number,
    message = 'Too many requests',
  ) {
    const now = Date.now();
    const current = this.windows.get(key);

    if (!current || current.resetAt <= now) {
      this.windows.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return;
    }

    if (current.count >= limit) {
      throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
    }

    current.count += 1;
  }
}
