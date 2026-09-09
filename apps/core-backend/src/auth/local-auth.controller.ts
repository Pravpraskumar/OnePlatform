import { Body, Controller, Post } from '@nestjs/common';
import { LocalAuthService } from './local-auth.service';
import { LoginDto, RegisterDto } from './dto/local-auth.dto';
import { Public } from './public.decorator';

@Controller('auth')
export class LocalAuthController {
  constructor(private readonly localAuth: LocalAuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.localAuth.register(dto);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.localAuth.login(dto);
  }
}
