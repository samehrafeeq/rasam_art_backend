import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContactService {
  constructor(private prisma: PrismaService) {}

  async createMessage(data: { name: string; email: string; phone: string; message: string }) {
    return this.prisma.contactMessage.create({
      data,
    });
  }

  async getMessages() {
    return this.prisma.contactMessage.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}
