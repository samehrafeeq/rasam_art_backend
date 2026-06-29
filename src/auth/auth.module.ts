import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'super-secret',
      signOptions: { expiresIn: '7d' },
    }),
    WhatsappModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
