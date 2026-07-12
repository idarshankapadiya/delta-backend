import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Firestore, Timestamp } from '@google-cloud/firestore';
import {
  ContactMessage,
  ContactMessageListResponse,
  CreateContactMessageInput,
  CreateContactMessageResponse,
} from './message.types';

interface StoredContactMessage {
  name?: unknown;
  mobile?: unknown;
  email?: unknown;
  message?: unknown;
  created_at?: unknown;
}

@Injectable()
export class MessageService {
  private firestore?: Firestore;
  private readonly collectionName = 'contact_messages';

  async createMessage(
    input: CreateContactMessageInput,
  ): Promise<CreateContactMessageResponse> {
    const createdAt = new Date();
    const data = {
      name: input.name.trim(),
      mobile: input.mobile.trim(),
      email: input.email.trim().toLowerCase(),
      message: input.message.trim(),
      created_at: Timestamp.fromDate(createdAt),
    };

    const docRef = await this.getCollection().add(data);

    return {
      ok: true,
      id: docRef.id,
      name: data.name,
      mobile: data.mobile,
      email: data.email,
      message: data.message,
      created_at: createdAt.toISOString(),
    };
  }

  async getMessages(): Promise<ContactMessageListResponse> {
    const snapshot = await this.getCollection()
      .orderBy('created_at', 'desc')
      .get();

    return {
      messages: snapshot.docs.map((doc) =>
        this.toContactMessage(doc.id, doc.data() as StoredContactMessage),
      ),
    };
  }

  private getCollection() {
    return this.getFirestore().collection(this.collectionName);
  }

  private getFirestore(): Firestore {
    if (!this.firestore) {
      this.firestore = this.createFirestore();
    }

    return this.firestore;
  }

  private createFirestore(): Firestore {
    const databaseId = process.env.FIRESTORE_DATABASE_ID?.trim();

    if (!databaseId) {
      throw new ServiceUnavailableException(
        'FIRESTORE_DATABASE_ID is required',
      );
    }

    return new Firestore({ databaseId });
  }

  private toContactMessage(
    id: string,
    data: StoredContactMessage,
  ): ContactMessage {
    return {
      id,
      name: this.toStringValue(data.name),
      mobile: this.toStringValue(data.mobile),
      email: this.toStringValue(data.email),
      message: this.toStringValue(data.message),
      created_at: this.toIsoDate(data.created_at),
    };
  }

  private toStringValue(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private toIsoDate(value: unknown): string {
    if (value instanceof Timestamp) {
      return value.toDate().toISOString();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (
      typeof value === 'object' &&
      value !== null &&
      'toDate' in value &&
      typeof (value as { toDate?: unknown }).toDate === 'function'
    ) {
      const date = (value as { toDate(): unknown }).toDate();
      return date instanceof Date ? date.toISOString() : '';
    }

    return typeof value === 'string' ? value : '';
  }
}
