import { Controller, Get, Patch, Delete, Param, Body, UseGuards, Request, Query, ForbiddenException, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import * as bcrypt from 'bcrypt';

@Controller('users')
@UseGuards(AuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @RequirePermission('users.view')
  async getAllUsers(
    @Request() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search: string = ''
  ) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    const whereCondition: any = search ? {
      OR: [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } }
      ]
    } : {};

    // Branch managers only see their branch's users (and usually shouldn't see admins)
    if (req.user.role === 'BRANCH_MANAGER') {
      if (!req.user.regionId) {
        return { data: [], meta: { total: 0, page: 1, lastPage: 1, limit: limitNum } };
      }
      whereCondition.regionId = req.user.regionId;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: whereCondition,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          regionId: true,
          region: { select: { id: true, name: true } },
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

  @Post()
  @RequirePermission('users.create')
  async createUser(@Request() req, @Body() body: any) {
    if (!body.email || !body.password || !body.name || !body.phone) {
      throw new ForbiddenException('الرجاء إكمال جميع البيانات المطلوبة');
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: body.email },
          { phone: body.phone }
        ]
      }
    });
    
    if (existingUser) {
      if (existingUser.email === body.email) {
        throw new ForbiddenException('البريد الإلكتروني مسجل مسبقاً');
      }
      if (existingUser.phone === body.phone) {
        throw new ForbiddenException('رقم الهاتف مسجل مسبقاً');
      }
    }

    if (req.user.role === 'BRANCH_MANAGER') {
      if (body.regionId && body.regionId !== req.user.regionId) {
        throw new ForbiddenException('لا يمكنك إضافة مستخدم لفرع آخر');
      }
      body.regionId = req.user.regionId; // force branch manager's region
    }

    const hashedPassword = await bcrypt.hash(body.password, 10);

    return this.prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone,
        password: hashedPassword,
        role: body.role || 'USER',
        regionId: body.regionId ? Number(body.regionId) : undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        regionId: true,
        region: { select: { id: true, name: true } },
        createdAt: true,
      }
    });
  }

  @Patch(':id')
  @RequirePermission('users.edit')
  async updateUser(@Request() req, @Param('id') id: string, @Body() body: any) {
    // Check if user is trying to change their own role (prevent demoting oneself)
    if (Number(id) === req.user.id && body.role && body.role !== 'ADMIN') {
      throw new ForbiddenException('لا يمكنك تغيير صلاحياتك كمدير حالي');
    }

    const targetUser = await this.prisma.user.findUnique({ where: { id: Number(id) } });
    if (!targetUser) throw new ForbiddenException('المستخدم غير موجود');

    // Branch Managers can only edit users in their branch
    if (req.user.role === 'BRANCH_MANAGER') {
      if (targetUser.regionId !== req.user.regionId) {
        throw new ForbiddenException('لا يمكنك تعديل مستخدم خارج فرعك');
      }
      // They also shouldn't be able to change roles or regions
      delete body.role;
      delete body.regionId;
    }

    // Assigning roles requires users.assign_role permission
    if (body.role && body.role !== targetUser.role) {
      // Typically only ADMIN has this, but check via guard if you added that logic.
      // Since we just use basic @RequirePermission on the route, we check role assign manually:
      const permissions = await req.user.permissions; // from JWT
      // (Wait, the permissions guard checked users.edit. We can also manually check users.assign_role)
      if (req.user.role !== 'ADMIN') {
         if (!req.user.permissions?.includes('users.assign_role')) {
             throw new ForbiddenException('لا تملك صلاحية تغيير أدوار المستخدمين');
         }
      }
    }

    if (body.email) {
      const existingEmail = await this.prisma.user.findFirst({
        where: { email: body.email, id: { not: Number(id) } }
      });
      if (existingEmail) throw new ForbiddenException('البريد الإلكتروني مستخدم لحساب آخر');
    }

    if (body.phone) {
      const existingPhone = await this.prisma.user.findFirst({
        where: { phone: body.phone, id: { not: Number(id) } }
      });
      if (existingPhone) throw new ForbiddenException('رقم الهاتف مستخدم لحساب آخر');
    }

    return this.prisma.user.update({
      where: { id: Number(id) },
      data: {
        name: body.name,
        phone: body.phone,
        role: body.role,
        regionId: body.regionId !== undefined ? body.regionId : undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        regionId: true,
        region: { select: { id: true, name: true } },
        createdAt: true,
      }
    });
  }

  @Delete(':id')
  @RequirePermission('users.delete')
  async deleteUser(@Request() req, @Param('id') id: string) {
    if (Number(id) === req.user.id) {
      throw new ForbiddenException('لا يمكنك حذف حسابك الخاص');
    }

    const targetUser = await this.prisma.user.findUnique({ where: { id: Number(id) } });
    if (!targetUser) throw new ForbiddenException('المستخدم غير موجود');

    if (req.user.role === 'BRANCH_MANAGER') {
      if (targetUser.regionId !== req.user.regionId) {
        throw new ForbiddenException('لا يمكنك حذف مستخدم خارج فرعك');
      }
    }

    await this.prisma.user.delete({
      where: { id: Number(id) }
    });

    return { success: true };
  }
}
