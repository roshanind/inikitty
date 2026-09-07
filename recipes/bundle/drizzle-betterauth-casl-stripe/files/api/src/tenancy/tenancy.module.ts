import { Module } from '@nestjs/common';
import { TenantContext } from './tenant-context';
import { TenantsController } from './tenants.controller';

@Module({
  controllers: [TenantsController],
  providers: [TenantContext],
  exports: [TenantContext],
})
export class TenancyModule {}
