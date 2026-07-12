import { BadRequestException } from '@nestjs/common';
import { RecaptchaEnterpriseService } from './recaptcha-enterprise.service';

describe('RecaptchaEnterpriseService', () => {
  const originalProjectId = process.env.RECAPTCHA_ENTERPRISE_PROJECT_ID;
  const originalSiteKey = process.env.RECAPTCHA_ENTERPRISE_SITE_KEY;
  let service: RecaptchaEnterpriseService;
  let getClient: jest.Mock;

  beforeEach(() => {
    getClient = jest.fn();
    service = new RecaptchaEnterpriseService();
    (
      service as unknown as {
        auth: { getClient: jest.Mock };
      }
    ).auth = { getClient };
  });

  afterEach(() => {
    restore('RECAPTCHA_ENTERPRISE_PROJECT_ID', originalProjectId);
    restore('RECAPTCHA_ENTERPRISE_SITE_KEY', originalSiteKey);
    jest.clearAllMocks();
  });

  it('skips verification when the site key is not configured', async () => {
    process.env.RECAPTCHA_ENTERPRISE_PROJECT_ID = 'deweb-preview1';
    delete process.env.RECAPTCHA_ENTERPRISE_SITE_KEY;

    await expect(
      service.verify(undefined, 'contact_message', '203.0.113.10'),
    ).resolves.toBeUndefined();
    expect(getClient).not.toHaveBeenCalled();
  });

  it('requires a token when reCAPTCHA is configured', async () => {
    process.env.RECAPTCHA_ENTERPRISE_PROJECT_ID = 'deweb-preview1';
    process.env.RECAPTCHA_ENTERPRISE_SITE_KEY = 'site-key';

    await expect(
      service.verify(undefined, 'contact_message', '203.0.113.10'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(getClient).not.toHaveBeenCalled();
  });
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
