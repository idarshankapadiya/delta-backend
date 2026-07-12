import { Timestamp } from '@google-cloud/firestore';
import { MessageService } from './message.service';

interface StoredMessage {
  created_at: Timestamp;
  email: string;
  message: string;
  mobile: string;
  name: string;
}

describe('MessageService', () => {
  let service: MessageService;
  let collection: {
    add: jest.Mock<Promise<{ id: string }>, [StoredMessage]>;
    orderBy: jest.Mock;
    get: jest.Mock;
  };

  beforeEach(() => {
    collection = {
      add: jest.fn<Promise<{ id: string }>, [StoredMessage]>(),
      orderBy: jest.fn(),
      get: jest.fn(),
    };

    const firestore = {
      collection: jest.fn(() => collection),
    };

    service = new MessageService();
    (
      service as unknown as {
        firestore: typeof firestore;
      }
    ).firestore = firestore;
  });

  it('stores a contact message with server-side created_at', async () => {
    collection.add.mockResolvedValue({ id: 'message-1' });

    const result = await service.createMessage({
      name: ' Customer ',
      mobile: ' 9999999999 ',
      email: ' CUSTOMER@EXAMPLE.COM ',
      message: ' Hello ',
    });

    expect(result).toMatchObject({
      ok: true,
      id: 'message-1',
      name: 'Customer',
      mobile: '9999999999',
      email: 'customer@example.com',
      message: 'Hello',
    });
    expect(typeof result.created_at).toBe('string');

    expect(collection.add).toHaveBeenCalledTimes(1);
    const storedMessage: unknown = collection.add.mock.calls[0]?.[0];
    expect(storedMessage).toMatchObject({
      name: 'Customer',
      mobile: '9999999999',
      email: 'customer@example.com',
      message: 'Hello',
    });
    expect(
      (storedMessage as { created_at?: unknown }).created_at,
    ).toBeInstanceOf(Timestamp);
  });

  it('returns messages newest first from Firestore order', async () => {
    collection.orderBy.mockReturnValue(collection);
    collection.get.mockResolvedValue({
      docs: [
        {
          id: 'message-2',
          data: () => ({
            name: 'Second',
            mobile: '8888888888',
            email: 'second@example.com',
            message: 'Second message',
            created_at: Timestamp.fromDate(
              new Date('2026-06-20T10:00:00.000Z'),
            ),
          }),
        },
        {
          id: 'message-1',
          data: () => ({
            name: 'First',
            mobile: '9999999999',
            email: 'first@example.com',
            message: 'First message',
            created_at: Timestamp.fromDate(
              new Date('2026-06-19T10:00:00.000Z'),
            ),
          }),
        },
      ],
    });

    await expect(service.getMessages()).resolves.toEqual({
      messages: [
        {
          id: 'message-2',
          name: 'Second',
          mobile: '8888888888',
          email: 'second@example.com',
          message: 'Second message',
          created_at: '2026-06-20T10:00:00.000Z',
        },
        {
          id: 'message-1',
          name: 'First',
          mobile: '9999999999',
          email: 'first@example.com',
          message: 'First message',
          created_at: '2026-06-19T10:00:00.000Z',
        },
      ],
    });
    expect(collection.orderBy).toHaveBeenCalledWith('created_at', 'desc');
  });
});
