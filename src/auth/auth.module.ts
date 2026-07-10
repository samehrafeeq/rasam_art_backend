import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PermissionsGuard } from './permissions.guard';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'super-secret',
      signOptions: { expiresIn: '7d' },
    }),
    WhatsappModule,
    PermissionsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, PermissionsGuard],
  exports: [AuthService, PermissionsGuard],
})
export class AuthModule {}

