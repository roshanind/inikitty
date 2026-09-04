import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import { Action } from '{{projectNameKebab}}-shared';
import { CheckPolicies } from '../casl/policies.decorator';
import { TenantContext } from '../tenancy/tenant-context';
import { BillingService } from './billing.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post('checkout')
  @CheckPolicies((ability) => ability.can(Action.Manage, 'Subscription'))
  async createCheckoutSession(@Body() dto: CreateCheckoutSessionDto): Promise<{ url: string }> {
    const tenantId = await this.tenantContext.getTenantId();
    const url = await this.billingService.createCheckoutSession(tenantId, dto.priceId);
    return { url };
  }

  @Post('portal')
  @CheckPolicies((ability) => ability.can(Action.Manage, 'Subscription'))
  async createPortalSession(): Promise<{ url: string }> {
    const tenantId = await this.tenantContext.getTenantId();
    const url = await this.billingService.createPortalSession(tenantId);
    return { url };
  }

  // Public: Stripe calls this directly, with no session — verified by signature instead (see
  // BillingService.handleWebhookEvent). `req.body` is the raw Buffer here, not parsed JSON — see
  // main.ts's middleware, which routes this exact path through express.raw() instead of json().
  @Post('webhook')
  @AllowAnonymous()
  async handleWebhook(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    return this.billingService.handleWebhookEvent(req.body as Buffer, signature);
  }
}
