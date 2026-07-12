import { Injectable, Logger } from '@nestjs/common';

export interface SecurityAuditEvent {
  action: string;
  outcome: 'allowed' | 'denied' | 'failed';
  email?: string;
  ip?: string;
  path?: string;
  reason?: string;
  subject?: string;
}

@Injectable()
export class SecurityAuditService {
  private readonly logger = new Logger('SecurityAudit');

  record(event: SecurityAuditEvent): void {
    this.logger.log(
      JSON.stringify({
        event_type: 'security_audit',
        occurred_at: new Date().toISOString(),
        ...event,
      }),
    );
  }
}
