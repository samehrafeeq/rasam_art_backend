import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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

  // ─── Instances ─────────────────────────────────────────────────────────

  /**
   * GET /whatsapp/instances
   * Returns all WhatsApp instances with their status and linked regions.
   */
  @Get('instances')
  async getAllInstances(@Request() req) {
    this.checkAdmin(req);
    return this.whatsappService.getAllInstancesStatus();
  }

  /**
   * POST /whatsapp/instances
   * Create a new WhatsApp instance. Body: { name: string }
   */
  @Post('instances')
  async createInstance(@Request() req, @Body() body: { name: string }) {
    this.checkAdmin(req);
    if (!body.name?.trim()) {
      throw new ForbiddenException('يرجى إدخال اسم للرقم');
    }
    return this.whatsappService.createInstance(body.name.trim());
  }

  /**
   * GET /whatsapp/instances/:id
   * Get status of a specific instance.
   */
  @Get('instances/:id')
  async getInstance(@Request() req, @Param('id') id: string) {
    this.checkAdmin(req);
    const result = await this.whatsappService.getInstanceStatus(+id);
    if (!result) throw new NotFoundException('الجلسة غير موجودة');
    return result;
  }

  /**
   * GET /whatsapp/instances/:id/qr
   * Get (or generate) a QR code for a specific instance.
   */
  @Get('instances/:id/qr')
  async getQr(@Request() req, @Param('id') id: string) {
    this.checkAdmin(req);
    const result = await this.whatsappService.getQrForInstance(+id);
    if (!result) throw new NotFoundException('الجلسة غير موجودة');
    return result;
  }

  /**
   * POST /whatsapp/instances/:id/logout
   * Logout (disconnect) a specific instance without deleting it.
   */
  @Post('instances/:id/logout')
  async logoutInstance(@Request() req, @Param('id') id: string) {
    this.checkAdmin(req);
    return this.whatsappService.logoutInstance(+id);
  }

  /**
   * DELETE /whatsapp/instances/:id
   * Permanently delete an instance and all its sessions.
   */
  @Delete('instances/:id')
  async deleteInstance(@Request() req, @Param('id') id: string) {
    this.checkAdmin(req);
    return this.whatsappService.deleteInstance(+id);
  }
}
