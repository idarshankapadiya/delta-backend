import {
  ForbiddenException,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { BusinessIdentity } from './business-auth.types';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class EnvBusinessAuthorizationProvider implements OnModuleInit {
  onModuleInit(): void {
    this.getAllowedEmails();
  }

  authorizeIdentity(identity: BusinessIdentity): void {
    if (!this.getAllowedEmails().has(identity.email)) {
      throw new ForbiddenException('Account is not authorized');
    }

    if (identity.email.endsWith('@gmail.com')) {
      return;
    }

    const requiredDomain = (
      process.env.BUSINESS_UI_REQUIRED_GOOGLE_DOMAIN ?? 'darshanent.co.in'
    )
      .trim()
      .toLowerCase();

    if (
      identity.email.endsWith(`@${requiredDomain}`) &&
      identity.hostedDomain?.toLowerCase() === requiredDomain
    ) {
      return;
    }

    if (this.getAllowedSubjects().has(identity.subject)) {
      return;
    }

    throw new ForbiddenException(
      'Non-Gmail accounts require a verified Workspace domain or allowed Google subject',
    );
  }

  isSessionAuthorized(subject: string, email: string): boolean {
    const normalizedEmail = email.toLowerCase();

    if (!this.getAllowedEmails().has(normalizedEmail)) {
      return false;
    }

    if (normalizedEmail.endsWith('@gmail.com')) {
      return true;
    }

    const requiredDomain = (
      process.env.BUSINESS_UI_REQUIRED_GOOGLE_DOMAIN ?? 'darshanent.co.in'
    )
      .trim()
      .toLowerCase();

    if (normalizedEmail.endsWith(`@${requiredDomain}`)) {
      return true;
    }

    return this.getAllowedSubjects().has(subject);
  }

  private getAllowedEmails(): Set<string> {
    const configured = process.env.BUSINESS_UI_ALLOWED_GOOGLE_EMAILS ?? '';
    const emails = configured
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);

    if (emails.length === 0) {
      throw new ServiceUnavailableException(
        'BUSINESS_UI_ALLOWED_GOOGLE_EMAILS is required',
      );
    }

    if (emails.some((email) => !emailPattern.test(email))) {
      throw new ServiceUnavailableException(
        'BUSINESS_UI_ALLOWED_GOOGLE_EMAILS contains an invalid email',
      );
    }

    if (new Set(emails).size !== emails.length) {
      throw new ServiceUnavailableException(
        'BUSINESS_UI_ALLOWED_GOOGLE_EMAILS contains duplicate emails',
      );
    }

    return new Set(emails);
  }

  private getAllowedSubjects(): Set<string> {
    return new Set(
      (process.env.BUSINESS_UI_ALLOWED_GOOGLE_SUBS ?? '')
        .split(',')
        .map((subject) => subject.trim())
        .filter(Boolean),
    );
  }
}
