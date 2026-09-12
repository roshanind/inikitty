import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
// @inikitty:inject:imports

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getRoot(): { name: string; status: string } {
    return this.appService.getInfo();
  }

  // @inikitty:inject:health-decorators
  @Get('health')
  getHealth(): { status: string } {
    return { status: 'ok' };
  }
}
