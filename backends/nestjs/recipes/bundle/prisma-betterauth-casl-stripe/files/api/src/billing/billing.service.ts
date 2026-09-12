import { BadRequestException, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import type { SubscriptionStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { forTenant } from '../tenancy/tenant.extension';

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is not set.`);
  }
  return value;
}

// Prisma's SubscriptionStatus enum was deliberately written to match Stripe's exact known status
// values — but Stripe's own TS type isn't a closed union (it has a forward-compatibility escape
// hatch for statuses added after this SDK version shipped), so it isn't assignable to Prisma's
// enum without this runtime check. A real mismatch here means Stripe added a new status value;
// failing loudly beats letting Postgres reject the write with an opaque invalid-enum-value error.
const KNOWN_STATUSES: ReadonlySet<string> = new Set<SubscriptionStatus>([
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused',
]);

function toPrismaStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  if (!KNOWN_STATUSES.has(status)) {
    throw new Error(`Unrecognized Stripe subscription status "${status}" — add it to the Prisma SubscriptionStatus enum.`);
  }
  return status as SubscriptionStatus;
}

/** Where to send the customer back after a hosted Checkout/Portal session. No FE billing pages
 * exist yet (see docs/product-scope.md §7.4 vs §7.6 — only Projects calls for FE pages), so this
 * just points at the app's root; swap for real success/cancel routes once those exist. */
function appUrl(): string {
  return process.env.APP_URL ?? 'http://localhost:5173';
}

@Injectable()
export class BillingService {
  private readonly stripe: Stripe;

  constructor(private readonly prisma: PrismaService) {
    this.stripe = new Stripe(requiredEnv('STRIPE_SECRET_KEY'));
  }

  async createCheckoutSession(tenantId: string, priceId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const customerId = tenant.stripeCustomerId ?? (await this.createCustomer(tenant.id, tenant.name));

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl()}/billing/success`,
      cancel_url: `${appUrl()}/billing/cancel`,
      // Set on both the Session and (via subscription_data) the Subscription it creates — the
      // Subscription's own copy is what the webhook actually reads, since Checkout Session
      // metadata doesn't propagate to later customer.subscription.* events on its own.
      metadata: { tenantId },
      subscription_data: { metadata: { tenantId } },
    });

    if (!session.url) {
      throw new BadRequestException('Stripe did not return a checkout URL.');
    }
    return session.url;
  }

  async createPortalSession(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (!tenant.stripeCustomerId) {
      throw new BadRequestException('This tenant has no billing account yet — start a checkout first.');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: appUrl(),
    });
    return session.url;
  }

  private async createCustomer(tenantId: string, tenantName: string): Promise<string> {
    const customer = await this.stripe.customers.create({
      name: tenantName,
      metadata: { tenantId },
    });
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { stripeCustomerId: customer.id },
    });
    return customer.id;
  }

  /** Verifies the signature, then syncs the `subscription` table for events that affect it.
   * Every other event type is ignored, not an error — Stripe sends far more event types than this
   * v1 slice cares about. */
  async handleWebhookEvent(rawBody: Buffer, signature: string | undefined): Promise<{ received: true }> {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header.');
    }
    // Stripe's types want a Uint8Array<ArrayBuffer> specifically — Node's Buffer type resolves to
    // Uint8Array<ArrayBufferLike>, which doesn't satisfy that generic. Passing the string form
    // (which Stripe's own docs list as an equally valid input) sidesteps the mismatch entirely.
    const event = this.stripe.webhooks.constructEvent(
      rawBody.toString('utf8'),
      signature,
      requiredEnv('STRIPE_WEBHOOK_SECRET'),
    );

    switch (event.type) {
      case 'checkout.session.completed':
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.syncSubscriptionFromEvent(event);
        break;
      default:
        break;
    }

    return { received: true };
  }

  private async syncSubscriptionFromEvent(event: Stripe.Event): Promise<void> {
    let subscription: Stripe.Subscription;

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      // Ignore one-time-payment Checkout sessions — this bundle only wires up subscriptions.
      if (session.mode !== 'subscription' || !session.subscription) return;
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
      subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    } else {
      subscription = event.data.object as Stripe.Subscription;
    }

    const tenantId = subscription.metadata.tenantId;
    // Not one of ours — e.g. a subscription created directly in the Stripe dashboard without the
    // tenantId metadata this bundle relies on. Nothing to sync.
    if (!tenantId) return;

    const item = subscription.items.data[0];
    const data = {
      stripeSubscriptionId: subscription.id,
      priceId: item.price.id,
      status: toPrismaStatus(subscription.status),
      currentPeriodEnd: new Date(item.current_period_end * 1000),
    };

    // Uses forTenant() directly with the tenant id straight from Stripe metadata, not
    // TenantContext — there's no authenticated request here, Stripe is calling this endpoint
    // directly. Same pattern as auth.ts's own signup hook writing the first membership row.
    await this.prisma.$extends(forTenant(tenantId)).subscription.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  }
}
