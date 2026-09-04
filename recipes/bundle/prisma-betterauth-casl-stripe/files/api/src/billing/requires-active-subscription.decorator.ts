import { applyDecorators, UseGuards } from '@nestjs/common';
import { ActiveSubscriptionGuard } from './active-subscription.guard';

/** Gates a route behind the tenant having an active (or trialing) Stripe subscription. Usable on
 * any controller whose module imports `BillingModule` (which exports the guard). */
export const RequiresActiveSubscription = () => applyDecorators(UseGuards(ActiveSubscriptionGuard));
