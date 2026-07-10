import { Injectable, UnauthorizedException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { PermissionsService } from '../permissions/permissions.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private whatsappService: WhatsappService,
    private permissionsService: PermissionsService,
  ) {}

  async signup(dto: SignupDto) {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.email },
          { phone: dto.phone },
        ],
      },
    });

    if (existingUser) {
      if (existingUser.email === dto.email) {
        throw new BadRequestException('البريد الإلكتروني مسجل مسبقاً');
      }
      if (existingUser.phone === dto.phone) {
        throw new BadRequestException('رقم الهاتف مسجل مسبقاً');
      }
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        password: hashedPassword,
      },
    });

    return this.signToken(user.id, user.email, user.role, user.name, null);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    }

    const pwMatches = await bcrypt.compare(dto.password, user.password);
    if (!pwMatches) {
      throw new UnauthorizedException('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    }

    return this.signToken(user.id, user.email, user.role, user.name, user.regionId);
  }

  private async signToken(userId: number, email: string, role: string, name: string, regionId: number | null) {
    const payload = { sub: userId, email, role, regionId };
    const token = await this.jwtService.signAsync(payload, {
      expiresIn: '7d',
      secret: process.env.JWT_SECRET || 'super-secret',
    });

    // Fetch effective permissions for the user (role + per-user overrides)
    const permissions = await this.permissionsService.getEffectivePermissions(role, userId);

    return {
      access_token: token,
      user: {
        id: userId,
        name,
        email,
        role,
        regionId,
        permissions,
      }
    };
  }

  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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
    if (!user) throw new UnauthorizedException('المستخدم غير موجود');
    return user;
  }

  async updateProfile(userId: number, data: { name?: string; email?: string; phone?: string; password?: string }) {
    if (data.email) {
      const existingEmail = await this.prisma.user.findFirst({
        where: { email: data.email, id: { not: userId } }
      });
      if (existingEmail) throw new BadRequestException('البريد الإلكتروني مستخدم لحساب آخر');
    }
    if (data.phone) {
      const existingPhone = await this.prisma.user.findFirst({
        where: { phone: data.phone, id: { not: userId } }
      });
      if (existingPhone) throw new BadRequestException('رقم الهاتف مستخدم لحساب آخر');
    }

    const updateData: any = { ...data };
    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
    } else {
      delete updateData.password;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
      }
    });

    return updated;
  }

  async forgotPassword(phone: string) {
    const user = await this.prisma.user.findFirst({ where: { phone } });
    if (!user) {
      // Return success anyway to prevent user enumeration
      return { message: 'إذا كان الرقم مسجلاً، سيتم إرسال كود الاستعادة' };
    }

    const now = new Date();
    if (user.resetCodeLastSentAt) {
      const diffSeconds = (now.getTime() - user.resetCodeLastSentAt.getTime()) / 1000;
      if (diffSeconds < 60) {
        throw new HttpException('يجب الانتظار لمدة دقيقة قبل طلب كود جديد', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    // Generate 6-digit code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 15);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetCode,
        resetCodeExpiry: expiry,
        resetCodeLastSentAt: now,
      }
    });

    // Send WhatsApp message
    const message = `*رسّام آرت للاستشارات الهندسية* 🏗️\n\nأهلاً بك ${user.name}،\nرمز استعادة كلمة المرور الخاص بك هو: *${resetCode}*\n\nالرمز صالح لمدة 15 دقيقة.`;
    await this.whatsappService.sendMessage(phone, message);

    return { message: 'تم إرسال كود الاستعادة بنجاح' };
  }

  async resetPassword(phone: string, code: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({ where: { phone } });
    if (!user || !user.resetCode) {
      throw new BadRequestException('الكود غير صحيح أو منتهي الصلاحية');
    }

    if (user.resetCode !== code) {
      throw new BadRequestException('الكود غير صحيح');
    }

    if (user.resetCodeExpiry && user.resetCodeExpiry < new Date()) {
      throw new BadRequestException('الكود منتهي الصلاحية، يرجى طلب كود جديد');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetCode: null,
        resetCodeExpiry: null,
        resetCodeLastSentAt: null,
      }
    });

    return { message: 'تم إعادة تعيين كلمة المرور بنجاح' };
  }
}
