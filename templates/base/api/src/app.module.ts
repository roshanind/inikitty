import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
// @inikitty:inject:imports

@Module({
  imports: [
    // @inikitty:inject:module-imports
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // @inikitty:inject:providers
  ],
})
export class AppModule {}
