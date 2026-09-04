import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ActiveSubscriptionGuard } from './active-subscription.guard';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [TenancyModule],
  controllers: [BillingController],
  providers: [BillingService, ActiveSubscriptionGuard],
  exports: [ActiveSubscriptionGuard],
})
export class BillingModule {}
