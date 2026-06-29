import { Controller, Get, Patch, Delete, Param, Body, UseGuards, Request, Query, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getAllUsers(
    @Request() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search: string = ''
  ) {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('غير مصرح لك بعرض هذه البيانات');
    }
    
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Search condition
    const whereCondition = search ? {
      OR: [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } }
      ]
    } : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: whereCondition,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      this.prisma.user.count({ where: whereCondition })
    ]);

    return {
      data: users,
      meta: {
        total,
        page: pageNum,
        lastPage: Math.ceil(total / limitNum) || 1,
        limit: limitNum
      }
    };
  }

  @Patch(':id')
  async updateUser(@Request() req, @Param('id') id: string, @Body() body: any) {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('غير مصرح لك بتعديل هذه البيانات');
    }
    
    // Check if user is trying to change their own role (prevent demoting oneself)
    if (Number(id) === req.user.id && body.role && body.role !== 'ADMIN') {
      throw new ForbiddenException('لا يمكنك تغيير صلاحياتك كمدير حالي');
    }

    return this.prisma.user.update({
      where: { id: Number(id) },
      data: {
        name: body.name,
        phone: body.phone,
        role: body.role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
      }
    });
  }

  @Delete(':id')
  async deleteUser(@Request() req, @Param('id') id: string) {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('غير مصرح لك بحذف الأعضاء');
    }
    
    if (Number(id) === req.user.id) {
      throw new ForbiddenException('لا يمكنك حذف حسابك الخاص');
    }

    await this.prisma.user.delete({
      where: { id: Number(id) }
    });

    return { success: true };
  }
}
