import { Firestore, Timestamp } from '@google-cloud/firestore';
import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';

@Injectable()
export class MessageRateLimiterService {
  private firestore?: Firestore;

  async assertAllowed(
    key: string,
    limit: number,
    windowMs: number,
    message: string,
  ): Promise<void> {
    const documentId = createHash('sha256').update(key).digest('hex');
    const reference = this.getFirestore()
      .collection('message_rate_limits')
      .doc(documentId);

    await this.getFirestore().runTransaction(async (transaction) => {
      const now = Date.now();
      const snapshot = await transaction.get(reference);
      const data = snapshot.data();
      const resetAt =
        data?.reset_at instanceof Timestamp ? data.reset_at.toMillis() : 0;
      const count = typeof data?.count === 'number' ? data.count : 0;

      if (!snapshot.exists || resetAt <= now) {
        const nextResetAt = Timestamp.fromMillis(now + windowMs);
        transaction.set(reference, {
          count: 1,
          expires_at: Timestamp.fromMillis(
            now + windowMs + 24 * 60 * 60 * 1000,
          ),
          reset_at: nextResetAt,
        });
        return;
      }

      if (count >= limit) {
        throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
      }

      transaction.update(reference, { count: count + 1 });
    });
  }

  private getFirestore(): Firestore {
    if (!this.firestore) {
      const databaseId = process.env.FIRESTORE_DATABASE_ID?.trim();

      if (!databaseId) {
        throw new ServiceUnavailableException(
          'FIRESTORE_DATABASE_ID is required',
        );
      }

      this.firestore = new Firestore({ databaseId });
    }

    return this.firestore;
  }
}
