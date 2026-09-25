import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { MessageRateLimiterService } from '../message/message-rate-limiter.service';
import { RecaptchaEnterpriseService } from '../message/recaptcha-enterprise.service';
import { NoStoreInterceptor } from '../security/no-store.interceptor';
import { PublicSiteOriginGuard } from '../security/origin.guards';
import { getClientIp } from '../security/request-context';
import {
  CreateQuotationRequestDto,
  ValidateCartDto,
} from './dto/quotation.dto';
import { QuotationService } from './quotation.service';

@Controller()
@UseInterceptors(NoStoreInterceptor)
@ApiTags('Quotations')
export class QuotationController {
  constructor(
    private readonly quotations: QuotationService,
    private readonly recaptcha: RecaptchaEnterpriseService,
    private readonly rateLimiter: MessageRateLimiterService,
  ) {}

  @Post('products/cart-validation')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PublicSiteOriginGuard)
  @ApiOperation({
    summary:
      'Validate cart products, quantities, availability, and current totals',
  })
  @ApiOkResponse({
    description: 'Authoritative cart validation result.',
    schema: {
      type: 'object',
      required: ['valid', 'items', 'issues', 'totals'],
      properties: {
        valid: { type: 'boolean', example: true },
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['productId', 'quantity', 'product'],
            properties: {
              productId: { type: 'string', example: 'compact-nsx-100' },
              quantity: { type: 'integer', example: 2 },
              product: {
                type: 'object',
                description:
                  'Current public product snapshot including price, currency, discount, inStock, and optional stockQuantity.',
              },
            },
          },
        },
        issues: {
          type: 'array',
          items: {
            type: 'object',
            required: ['productId', 'code', 'message'],
            properties: {
              productId: { type: 'string' },
              code: {
                type: 'string',
                enum: [
                  'duplicate',
                  'not_found',
                  'out_of_stock',
                  'quantity_unavailable',
                ],
              },
              message: { type: 'string' },
            },
          },
        },
        totals: {
          type: 'object',
          additionalProperties: { type: 'number' },
          example: { INR: 18450 },
        },
      },
    },
  })
  validateCart(@Body() body: ValidateCartDto) {
    return this.quotations.validateCart(body.items);
  }

  @Post('quotation-requests')
  @UseGuards(PublicSiteOriginGuard)
  @ApiOperation({
    summary: 'Create a quotation request from an authoritative cart snapshot',
    description:
      'Revalidates product availability, stock quantity, prices, discounts, and currency on the server before saving the quotation. Client totals are never accepted.',
  })
  @ApiCreatedResponse({
    description: 'Quotation request saved.',
    schema: {
      type: 'object',
      required: ['ok', 'quotation'],
      properties: {
        ok: { type: 'boolean', example: true },
        quotation: {
          type: 'object',
          required: [
            'id',
            'reference',
            'status',
            'customer',
            'items',
            'totals',
            'created_at',
            'updated_at',
          ],
          properties: {
            id: { type: 'string', example: 'QUO-01K5ABCDEF0123456789ABCDE' },
            reference: {
              type: 'string',
              example: 'QUO-01K5ABCDEF0123456789ABCDE',
            },
            status: { type: 'string', example: 'new' },
            customer: { type: 'object' },
            items: { type: 'array', items: { type: 'object' } },
            totals: {
              type: 'object',
              additionalProperties: { type: 'number' },
              example: { INR: 18450 },
            },
            notes: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  @ApiConflictResponse({
    description:
      'One or more cart products or quantities are no longer available.',
  })
  @ApiTooManyRequestsResponse({
    description: 'Quotation submission limit exceeded.',
  })
  async createQuotation(
    @Body() body: CreateQuotationRequestDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const ip = getClientIp(request);
    const contactKey = `${body.customer.email.trim().toLowerCase()}:${body.customer.mobile.trim()}`;
    await this.rateLimiter.assertAllowed(
      `quotation-ip:${ip}`,
      10,
      60 * 60 * 1000,
      'Too many quotation requests',
    );
    await this.recaptcha.verify(body.captcha_token, 'quotation_request', ip);
    await this.rateLimiter.assertAllowed(
      `quotation-contact:${contactKey}`,
      3,
      15 * 60 * 1000,
      'Please wait before sending another quotation request',
    );
    reply.header('Cache-Control', 'no-store');
    return this.quotations.createQuotation(body);
  }
}
