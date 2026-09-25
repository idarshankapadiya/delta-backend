import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { Injectable, Logger } from '@nestjs/common';
import type { QuotationRequest } from './quotation.types';

@Injectable()
export class QuotationNotificationService {
  private readonly logger = new Logger(QuotationNotificationService.name);

  async notify(quotation: QuotationRequest): Promise<void> {
    const recipient = process.env.QUOTATION_NOTIFICATION_EMAIL_TO?.trim();
    const sender = process.env.QUOTATION_EMAIL_FROM?.trim();

    if (!recipient || !sender) {
      this.logger.log(
        `Quotation ${quotation.reference} saved; email notification is not configured`,
      );
      return;
    }

    const client = new SESv2Client({
      region: process.env.AWS_REGION ?? process.env.AWS_SES_REGION,
    });
    const body = this.createEmailBody(quotation);

    await client.send(
      new SendEmailCommand({
        FromEmailAddress: sender,
        Destination: { ToAddresses: [recipient] },
        Content: {
          Simple: {
            Subject: { Data: `New quotation request ${quotation.reference}` },
            Body: { Text: { Data: body } },
          },
        },
      }),
    );

    if (process.env.QUOTATION_SEND_CUSTOMER_ACKNOWLEDGEMENT === 'true') {
      await client.send(
        new SendEmailCommand({
          FromEmailAddress: sender,
          Destination: { ToAddresses: [quotation.customer.email] },
          Content: {
            Simple: {
              Subject: {
                Data: `We received your quotation request ${quotation.reference}`,
              },
              Body: {
                Text: {
                  Data: `Thank you, ${quotation.customer.name}. We received your request for ${quotation.items.length} product${quotation.items.length === 1 ? '' : 's'}. Our team will confirm availability and final commercial terms. Reference: ${quotation.reference}.`,
                },
              },
            },
          },
        }),
      );
    }
  }

  private createEmailBody(quotation: QuotationRequest): string {
    return [
      `Reference: ${quotation.reference}`,
      `Customer: ${quotation.customer.name}`,
      quotation.customer.company
        ? `Company: ${quotation.customer.company}`
        : '',
      `Email: ${quotation.customer.email}`,
      `Mobile: ${quotation.customer.mobile}`,
      `Delivery location: ${quotation.customer.deliveryLocation}`,
      '',
      ...quotation.items.map(
        (item, index) =>
          `${index + 1}. ${item.name} (${item.modelNumber ?? item.sku ?? item.productId}) x ${item.quantity} = ${item.currency} ${item.lineTotal.toFixed(2)}`,
      ),
      quotation.notes ? `\nNotes: ${quotation.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
