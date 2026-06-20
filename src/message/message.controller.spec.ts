import { Test, TestingModule } from '@nestjs/testing';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';

describe('MessageController', () => {
  let controller: MessageController;
  let service: {
    createMessage: jest.Mock;
    getMessages: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      createMessage: jest.fn(),
      getMessages: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MessageController],
      providers: [
        {
          provide: MessageService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<MessageController>(MessageController);
  });

  it('creates a contact message', async () => {
    service.createMessage.mockResolvedValue({
      ok: true,
      id: 'message-1',
      name: 'Customer',
      mobile: '9999999999',
      email: 'customer@example.com',
      message: 'Hello',
      created_at: '2026-06-20T10:00:00.000Z',
    });

    await expect(
      controller.createMessage({
        name: 'Customer',
        mobile: '9999999999',
        email: 'customer@example.com',
        message: 'Hello',
      }),
    ).resolves.toMatchObject({
      ok: true,
      id: 'message-1',
    });
  });

  it('gets contact messages', async () => {
    service.getMessages.mockResolvedValue({
      messages: [
        {
          id: 'message-1',
          name: 'Customer',
          mobile: '9999999999',
          email: 'customer@example.com',
          message: 'Hello',
          created_at: '2026-06-20T10:00:00.000Z',
        },
      ],
    });

    await expect(controller.getMessages()).resolves.toEqual({
      messages: [
        expect.objectContaining({
          id: 'message-1',
          email: 'customer@example.com',
        }),
      ],
    });
  });
});
