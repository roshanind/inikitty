import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PoliciesGuard } from './policies.guard';

@Module({
  imports: [TenancyModule],
  providers: [{ provide: APP_GUARD, useClass: PoliciesGuard }],
})
export class CaslModule {}
