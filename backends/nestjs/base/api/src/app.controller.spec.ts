import { Test } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    controller = moduleRef.get(AppController);
  });

  it('returns app info', () => {
    expect(controller.getRoot()).toEqual({ name: '{{projectName}}', status: 'ok' });
  });

  it('reports healthy', () => {
    expect(controller.getHealth()).toEqual({ status: 'ok' });
  });
});
