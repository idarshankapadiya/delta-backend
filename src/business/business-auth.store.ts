import {
  Firestore,
  Timestamp,
  type DocumentData,
} from '@google-cloud/firestore';
import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  BusinessIdentity,
  BusinessUser,
  StoredBusinessSession,
} from './business-auth.types';

@Injectable()
export class BusinessAuthStore {
  private firestore?: Firestore;
  private readonly sessionsCollection = 'business_sessions';
  private readonly usersCollection = 'business_users';

  async bindUser(identity: BusinessIdentity): Promise<BusinessUser> {
    const userRef = this.getFirestore()
      .collection(this.usersCollection)
      .doc(identity.subject);
    const now = Timestamp.now();

    return this.getFirestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(userRef);

      if (snapshot.exists) {
        const user = this.toUser(identity.subject, snapshot.data() ?? {});

        if (user.email !== identity.email) {
          throw new ConflictException(
            'Google account identity does not match the approved user binding',
          );
        }

        transaction.update(userRef, {
          last_login_at: now,
          name: identity.name,
          updated_at: now,
        });
        return { ...user, name: identity.name };
      }

      const user: BusinessUser = {
        email: identity.email,
        name: identity.name,
        role: 'business_admin',
        status: 'active',
        subject: identity.subject,
      };
      transaction.create(userRef, {
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        created_at: now,
        last_login_at: now,
        updated_at: now,
      });
      return user;
    });
  }

  async getUser(subject: string): Promise<BusinessUser | null> {
    const snapshot = await this.getFirestore()
      .collection(this.usersCollection)
      .doc(subject)
      .get();

    return snapshot.exists ? this.toUser(subject, snapshot.data() ?? {}) : null;
  }

  async createSession(
    tokenHash: string,
    session: StoredBusinessSession,
  ): Promise<void> {
    await this.getFirestore()
      .collection(this.sessionsCollection)
      .doc(tokenHash)
      .create(this.toStoredSession(session));
  }

  async getSession(tokenHash: string): Promise<StoredBusinessSession | null> {
    const snapshot = await this.getFirestore()
      .collection(this.sessionsCollection)
      .doc(tokenHash)
      .get();

    return snapshot.exists
      ? this.fromStoredSession(snapshot.data() ?? {})
      : null;
  }

  async updateSession(
    tokenHash: string,
    updates: Partial<StoredBusinessSession>,
  ): Promise<void> {
    await this.getFirestore()
      .collection(this.sessionsCollection)
      .doc(tokenHash)
      .update(this.toStoredSession(updates));
  }

  async listActiveSessions(
    subject: string,
  ): Promise<Array<{ tokenHash: string; session: StoredBusinessSession }>> {
    const snapshot = await this.getFirestore()
      .collection(this.sessionsCollection)
      .where('subject', '==', subject)
      .get();

    return snapshot.docs
      .map((doc) => ({
        tokenHash: doc.id,
        session: this.fromStoredSession(doc.data()),
      }))
      .filter(({ session }) => !session.revokedAt)
      .sort(
        (left, right) =>
          left.session.createdAt.getTime() - right.session.createdAt.getTime(),
      );
  }

  async revokeSession(
    tokenHash: string,
    replacedByHash?: string,
  ): Promise<void> {
    const updates: DocumentData = {
      revoked_at: Timestamp.now(),
    };

    if (replacedByHash) {
      updates.replaced_by_hash = replacedByHash;
      updates.grace_expires_at = Timestamp.fromMillis(Date.now() + 60_000);
    }

    await this.getFirestore()
      .collection(this.sessionsCollection)
      .doc(tokenHash)
      .set(updates, { merge: true });
  }

  async revokeSessionsForSubject(subject: string): Promise<void> {
    const sessions = await this.listActiveSessions(subject);
    const batch = this.getFirestore().batch();

    for (const { tokenHash } of sessions) {
      batch.set(
        this.getFirestore().collection(this.sessionsCollection).doc(tokenHash),
        { revoked_at: Timestamp.now() },
        { merge: true },
      );
    }

    if (sessions.length > 0) {
      await batch.commit();
    }
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

  private toUser(subject: string, data: DocumentData): BusinessUser {
    return {
      subject,
      email: this.requiredString(data.email, 'business user email'),
      name: this.requiredString(data.name, 'business user name'),
      role: 'business_admin',
      status: data.status === 'disabled' ? 'disabled' : 'active',
    };
  }

  private toStoredSession(
    session: Partial<StoredBusinessSession>,
  ): DocumentData {
    const data: DocumentData = {};
    const mappings: Array<[keyof StoredBusinessSession, string]> = [
      ['email', 'email'],
      ['name', 'name'],
      ['role', 'role'],
      ['subject', 'subject'],
      ['replacedByHash', 'replaced_by_hash'],
    ];
    const dateMappings: Array<[keyof StoredBusinessSession, string]> = [
      ['createdAt', 'created_at'],
      ['expiresAt', 'expires_at'],
      ['graceExpiresAt', 'grace_expires_at'],
      ['idleExpiresAt', 'idle_expires_at'],
      ['lastSeenAt', 'last_seen_at'],
      ['revokedAt', 'revoked_at'],
      ['rotateAfter', 'rotate_after'],
    ];

    for (const [property, field] of mappings) {
      if (session[property] !== undefined) {
        data[field] = session[property];
      }
    }

    for (const [property, field] of dateMappings) {
      const value = session[property];
      if (value instanceof Date) {
        data[field] = Timestamp.fromDate(value);
      }
    }

    return data;
  }

  private fromStoredSession(data: DocumentData): StoredBusinessSession {
    return {
      createdAt: this.requiredDate(data.created_at, 'session created_at'),
      email: this.requiredString(data.email, 'session email'),
      expiresAt: this.requiredDate(data.expires_at, 'session expires_at'),
      graceExpiresAt: this.optionalDate(data.grace_expires_at),
      idleExpiresAt: this.requiredDate(
        data.idle_expires_at,
        'session idle_expires_at',
      ),
      lastSeenAt: this.requiredDate(data.last_seen_at, 'session last_seen_at'),
      name: this.requiredString(data.name, 'session name'),
      replacedByHash:
        typeof data.replaced_by_hash === 'string'
          ? data.replaced_by_hash
          : undefined,
      revokedAt: this.optionalDate(data.revoked_at),
      role: 'business_admin',
      rotateAfter: this.requiredDate(data.rotate_after, 'session rotate_after'),
      subject: this.requiredString(data.subject, 'session subject'),
    };
  }

  private requiredString(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new ServiceUnavailableException(`Invalid ${label}`);
    }

    return value;
  }

  private requiredDate(value: unknown, label: string): Date {
    const date = this.optionalDate(value);

    if (!date) {
      throw new ServiceUnavailableException(`Invalid ${label}`);
    }

    return date;
  }

  private optionalDate(value: unknown): Date | undefined {
    if (value instanceof Timestamp) {
      return value.toDate();
    }

    if (value instanceof Date) {
      return value;
    }

    return undefined;
  }
}
