import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EnvBusinessAuthorizationProvider } from './business-authorization.provider';

describe('EnvBusinessAuthorizationProvider', () => {
  const originalEmails = process.env.BUSINESS_UI_ALLOWED_GOOGLE_EMAILS;
  const originalSubjects = process.env.BUSINESS_UI_ALLOWED_GOOGLE_SUBS;
  const originalDomain = process.env.BUSINESS_UI_REQUIRED_GOOGLE_DOMAIN;
  const provider = new EnvBusinessAuthorizationProvider();

  afterEach(() => {
    restore('BUSINESS_UI_ALLOWED_GOOGLE_EMAILS', originalEmails);
    restore('BUSINESS_UI_ALLOWED_GOOGLE_SUBS', originalSubjects);
    restore('BUSINESS_UI_REQUIRED_GOOGLE_DOMAIN', originalDomain);
  });

  it('matches Gmail addresses case-insensitively', () => {
    process.env.BUSINESS_UI_ALLOWED_GOOGLE_EMAILS = 'Admin@Gmail.com';

    expect(() =>
      provider.authorizeIdentity({
        email: 'admin@gmail.com',
        name: 'Admin',
        subject: 'gmail-sub',
      }),
    ).not.toThrow();
  });

  it('requires the Workspace hd claim on first login', () => {
    process.env.BUSINESS_UI_ALLOWED_GOOGLE_EMAILS = 'admin@darshanent.co.in';

    expect(() =>
      provider.authorizeIdentity({
        email: 'admin@darshanent.co.in',
        name: 'Admin',
        subject: 'workspace-sub',
      }),
    ).toThrow(ForbiddenException);
    expect(() =>
      provider.authorizeIdentity({
        email: 'admin@darshanent.co.in',
        hostedDomain: 'darshanent.co.in',
        name: 'Admin',
        subject: 'workspace-sub',
      }),
    ).not.toThrow();
  });

  it('requires an explicit subject for other hosted email addresses', () => {
    process.env.BUSINESS_UI_ALLOWED_GOOGLE_EMAILS = 'admin@example.com';
    process.env.BUSINESS_UI_ALLOWED_GOOGLE_SUBS = 'expected-sub';

    expect(() =>
      provider.authorizeIdentity({
        email: 'admin@example.com',
        name: 'Admin',
        subject: 'unexpected-sub',
      }),
    ).toThrow(ForbiddenException);
    expect(() =>
      provider.authorizeIdentity({
        email: 'admin@example.com',
        name: 'Admin',
        subject: 'expected-sub',
      }),
    ).not.toThrow();
  });

  it('fails startup validation for missing, duplicate, or malformed entries', () => {
    process.env.BUSINESS_UI_ALLOWED_GOOGLE_EMAILS = '';
    expect(() => provider.onModuleInit()).toThrow(ServiceUnavailableException);

    process.env.BUSINESS_UI_ALLOWED_GOOGLE_EMAILS =
      'admin@gmail.com,ADMIN@gmail.com';
    expect(() => provider.onModuleInit()).toThrow(ServiceUnavailableException);

    process.env.BUSINESS_UI_ALLOWED_GOOGLE_EMAILS = 'not-an-email';
    expect(() => provider.onModuleInit()).toThrow(ServiceUnavailableException);
  });
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
