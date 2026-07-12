import type { FastifyReply, FastifyRequest } from 'fastify';
import { MessageController } from './message.controller';
import { MessageRateLimiterService } from './message-rate-limiter.service';
import { MessageService } from './message.service';
import { RecaptchaEnterpriseService } from './recaptcha-enterprise.service';

describe('MessageController', () => {
  const service = {
    createMessage: jest.fn(),
  };
  const recaptcha = {
    verify: jest.fn(),
  };
  const rateLimiter = {
    assertAllowed: jest.fn(),
  };
  const controller = new MessageController(
    service as unknown as MessageService,
    recaptcha as unknown as RecaptchaEnterpriseService,
    rateLimiter as unknown as MessageRateLimiterService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    recaptcha.verify.mockResolvedValue(undefined);
    rateLimiter.assertAllowed.mockResolvedValue(undefined);
  });

  it('verifies CAPTCHA, applies both limits, and stores no CAPTCHA token', async () => {
    service.createMessage.mockResolvedValue({
      ok: true,
      id: 'message-1',
      created_at: '2026-06-20T10:00:00.000Z',
    });
    const reply = { header: jest.fn() };

    await expect(
      controller.createMessage(
        {
          name: 'Customer',
          mobile: '9999999999',
          email: 'Customer@Example.com',
          message: 'Hello',
          captcha_token: 'captcha-token',
        },
        {
          ip: '203.0.113.10',
          headers: {},
        } as FastifyRequest,
        reply as unknown as FastifyReply,
      ),
    ).resolves.toMatchObject({
      ok: true,
      id: 'message-1',
    });

    expect(rateLimiter.assertAllowed).toHaveBeenNthCalledWith(
      1,
      'contact-message-ip:203.0.113.10',
      5,
      60 * 60 * 1000,
      'Too many contact messages',
    );
    expect(recaptcha.verify).toHaveBeenCalledWith(
      'captcha-token',
      'contact_message',
      '203.0.113.10',
    );
    expect(rateLimiter.assertAllowed).toHaveBeenNthCalledWith(
      2,
      'contact-message-contact:customer@example.com:9999999999',
      1,
      10 * 60 * 1000,
      'Please wait before sending another message',
    );
    expect(service.createMessage).toHaveBeenCalledWith({
      name: 'Customer',
      mobile: '9999999999',
      email: 'Customer@Example.com',
      message: 'Hello',
    });
    expect(reply.header).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
});
