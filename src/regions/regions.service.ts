import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RegionsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.region.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        whatsappInstance: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async findOne(id: number) {
    const region = await this.prisma.region.findUnique({
      where: { id },
      include: {
        whatsappInstance: {
          select: { id: true, name: true },
        },
      },
    });
    if (!region) throw new NotFoundException('Region not found');
    return region;
  }

  async create(data: { name: string; description?: string; phoneNumbers?: string; whatsappInstanceId?: number | null }) {
    return this.prisma.region.create({
      data: {
        name: data.name,
        description: data.description || null,
        phoneNumbers: data.phoneNumbers || null,
        disabledServiceIds: [],
        whatsappInstanceId: data.whatsappInstanceId || null,
      },
      include: {
        whatsappInstance: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: number, data: { name?: string; description?: string; phoneNumbers?: string; disabledServiceIds?: any; whatsappInstanceId?: number | null }) {
    await this.findOne(id);
    return this.prisma.region.update({
      where: { id },
      data,
      include: {
        whatsappInstance: { select: { id: true, name: true } },
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.region.delete({
      where: { id },
    });
  }
}
