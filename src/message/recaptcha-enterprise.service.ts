import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';

interface RecaptchaAssessment {
  riskAnalysis?: {
    score?: number;
  };
  tokenProperties?: {
    action?: string;
    valid?: boolean;
  };
}

@Injectable()
export class RecaptchaEnterpriseService {
  private readonly auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  async verify(
    token: string | undefined,
    expectedAction: string,
    ip: string,
  ): Promise<void> {
    const projectId = process.env.RECAPTCHA_ENTERPRISE_PROJECT_ID?.trim();
    const siteKey = process.env.RECAPTCHA_ENTERPRISE_SITE_KEY?.trim();

    if (!siteKey) {
      return;
    }

    if (!token?.trim()) {
      throw new BadRequestException('Contact verification token is required');
    }

    if (
      process.env.NODE_ENV !== 'production' &&
      process.env.RECAPTCHA_ENTERPRISE_BYPASS_FOR_LOCAL === 'true' &&
      token === 'local-development'
    ) {
      return;
    }

    if (!projectId) {
      throw new ServiceUnavailableException(
        'reCAPTCHA Enterprise is not configured',
      );
    }

    const client = await this.auth.getClient();
    const response = await client.request<RecaptchaAssessment>({
      url: `https://recaptchaenterprise.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/assessments`,
      method: 'POST',
      data: {
        event: {
          expectedAction,
          siteKey,
          token,
          userIpAddress: ip === 'unknown' ? undefined : ip,
        },
      },
    });
    const valid = response.data.tokenProperties?.valid === true;
    const actionMatches =
      response.data.tokenProperties?.action === expectedAction;
    const score = response.data.riskAnalysis?.score ?? 0;
    const minimumScore = this.getMinimumScore();

    if (!valid || !actionMatches || score < minimumScore) {
      throw new ForbiddenException('Contact verification failed');
    }
  }

  private getMinimumScore(): number {
    const configured = Number(process.env.RECAPTCHA_ENTERPRISE_MIN_SCORE);
    return Number.isFinite(configured) && configured >= 0 && configured <= 1
      ? configured
      : 0.5;
  }
}
