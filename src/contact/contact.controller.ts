import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { ContactService } from './contact.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  async createMessage(@Body() body: { name: string; email: string; phone: string; message: string }) {
    await this.contactService.createMessage(body);
    return { message: 'تم إرسال رسالتك بنجاح' };
  }

  @UseGuards(AuthGuard)
  @Get()
  async getMessages(@Request() req) {
    if (req.user.role !== 'ADMIN') {
      throw new Error('Unauthorized');
    }
    return this.contactService.getMessages();
  }
}
