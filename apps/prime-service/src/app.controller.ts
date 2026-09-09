import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'prime-service', time: new Date().toISOString() };
  }

  // Placeholder landing payload; real product surface arrives later.
  @Get('landing')
  landing() {
    return {
      product: 'PRIME',
      title: 'Project Requirements & Ident Material Engine',
      description: 'PRIME module landing. Feature set to be defined.',
    };
  }
}
