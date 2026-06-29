import { Controller, Get, Post, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('whatsapp')
@UseGuards(AuthGuard)
export class WhatsappController {
  constructor(private whatsappService: WhatsappService) {}

  private checkAdmin(req: any) {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('غير مصرح لك بإدارة الواتساب');
    }
  }

  @Get('status')
  async getStatus(@Request() req) {
    this.checkAdmin(req);
    return this.whatsappService.getStatus();
  }

  @Get('qr')
  async getQr(@Request() req) {
    this.checkAdmin(req);
    return this.whatsappService.getQrCode();
  }

  @Post('logout')
  async logout(@Request() req) {
    this.checkAdmin(req);
    return this.whatsappService.logout();
  }
}
