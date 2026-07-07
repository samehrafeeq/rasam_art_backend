import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestStatus } from '@prisma/client';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { SERVICES_DATA } from './services-data';

@Injectable()
export class RequestsService {
  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsappService
  ) {}

  async create(data: { userId: number; regionId: number; serviceId: number; message?: string }) {
    const request = await this.prisma.serviceRequest.create({
      data: {
        userId: data.userId,
        regionId: data.regionId,
        serviceId: data.serviceId,
        message: data.message || null,
        status: RequestStatus.PENDING,
      },
      include: { user: true, region: true }
    });

    const serviceName = SERVICES_DATA.find(s => s.id === request.serviceId)?.name || 'الخدمة المطلوبة';
    
    let message = `مرحباً بك أستاذ/ة *${request.user.name}* 👋\n\n`;
    message += `نود إعلامك بأنه تم استلام طلبك بنجاح لدى *رسّام آرت للاستشارات الهندسية* 📐\n\n`;
    message += `📌 *الخدمة:* ${serviceName}\n`;
    message += `📍 *المنطقة:* ${request.region?.name || 'غير محدد'}\n`;
    message += `🔢 *رقم الطلب:* #${request.id}\n\n`;
    message += `⏳ *حالة الطلب:* قيد المراجعة\n\n`;
    message += `سيقوم فريقنا بمراجعة طلبك وإفادتك في أقرب وقت ممكن. شكراً لثقتكم بنا! 🌟`;

    this.whatsapp.sendMessage(request.user.phone, message).catch(() => {});

    return request;
  }

  async findAll(filters?: { userId?: number; regionId?: number; status?: RequestStatus }) {
    const where: any = {};
    if (filters?.userId) where.userId = filters.userId;
    if (filters?.regionId) where.regionId = filters.regionId;
    if (filters?.status) where.status = filters.status;

    return this.prisma.serviceRequest.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true }
        },
        region: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: number) {
    return this.prisma.serviceRequest.findUnique({
      where: { id },
      include: { user: true, region: true },
    });
  }

  async updateStatus(id: number, data: { status: RequestStatus; rejectReason?: string }) {
    const request = await this.prisma.serviceRequest.findUnique({ 
      where: { id },
      include: { user: true, region: true } 
    });
    
    if (!request) throw new NotFoundException('Request not found');

    const updated = await this.prisma.serviceRequest.update({
      where: { id },
      data: {
        status: data.status,
        rejectReason: data.status === RequestStatus.REJECTED ? data.rejectReason : null,
      },
    });

    if (data.status === RequestStatus.ACCEPTED || data.status === RequestStatus.REJECTED) {
      const serviceName = SERVICES_DATA.find(s => s.id === request.serviceId)?.name || 'الخدمة المطلوبة';
      const isAccepted = data.status === RequestStatus.ACCEPTED;
      
      let message = `مرحباً بك أستاذ/ة *${request.user.name}* 👋\n\n`;
      message += `نود إعلامك بتحديث حالة طلبك لدى *رسّام آرت للاستشارات الهندسية* 📐\n\n`;
      message += `📌 *الخدمة:* ${serviceName}\n`;
      message += `📍 *المنطقة:* ${request.region?.name || 'غير محدد'}\n`;
      message += `🔢 *رقم الطلب:* #${request.id}\n\n`;
      
      if (isAccepted) {
        message += `✅ *حالة الطلب:* تم قبول الطلب وجاري العمل عليه\n\n`;
        message += `سعداء بثقتكم بنا، وسيقوم فريقنا الهندسي بالتواصل معكم قريباً لاستكمال الإجراءات. شكراً لاختياركم رسّام آرت! 🌟`;
      } else {
        message += `❌ *حالة الطلب:* نعتذر، تم رفض الطلب\n`;
        if (data.rejectReason) {
          message += `📝 *السبب:* ${data.rejectReason}\n`;
        }
        message += `\nنتمنى لكم التوفيق، ونسعد بخدمتكم في طلبات أخرى.`;
      }

      // Fire and forget
      this.whatsapp.sendMessage(request.user.phone, message).catch(() => {});
    }

    return updated;
  }

  /**
   * Employee requests a rejection.
   * Changes status to PENDING_REJECTION and stores who requested it and why.
   */
  async requestRejection(requestId: number, employeeUserId: number, reason?: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id: requestId },
      include: { region: true },
    });

    if (!request) throw new NotFoundException('الطلب غير موجود');
    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException('لا يمكن طلب رفض إلا للطلبات قيد المراجعة');
    }

    const updated = await this.prisma.serviceRequest.update({
      where: { id: requestId },
      data: {
        status: RequestStatus.PENDING_REJECTION,
        rejectionRequestedBy: employeeUserId,
        rejectionRequestedAt: new Date(),
        rejectionRequestReason: reason || null,
      },
    });

    // Notify branch manager(s) via WhatsApp
    if (request.regionId) {
      const managers = await this.prisma.user.findMany({
        where: {
          regionId: request.regionId,
          role: { in: ['BRANCH_MANAGER'] },
        },
      });

      const employee = await this.prisma.user.findUnique({ where: { id: employeeUserId } });
      const serviceName = SERVICES_DATA.find(s => s.id === request.serviceId)?.name || 'الخدمة المطلوبة';

      for (const manager of managers) {
        let msg = `⚠️ *طلب مراجعة رفض* — رسّام آرت\n\n`;
        msg += `الموظف *${employee?.name || 'موظف'}* طلب رفض الطلب #${requestId}\n`;
        msg += `📌 الخدمة: ${serviceName}\n`;
        msg += `📍 الفرع: ${request.region?.name || 'غير محدد'}\n`;
        if (reason) msg += `📝 السبب: ${reason}\n`;
        msg += `\nيرجى مراجعة الطلب من لوحة التحكم.`;

        this.whatsapp.sendMessage(manager.phone, msg).catch(() => {});
      }
    }

    return updated;
  }

  /**
   * Branch Manager / Admin reviews a rejection request.
   * If approved → REJECTED (+ WhatsApp notification to client).
   * If not approved → back to PENDING.
   */
  async reviewRejection(requestId: number, approved: boolean) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id: requestId },
      include: { user: true, region: true },
    });

    if (!request) throw new NotFoundException('الطلب غير موجود');
    if (request.status !== RequestStatus.PENDING_REJECTION) {
      throw new BadRequestException('هذا الطلب ليس بانتظار مراجعة الرفض');
    }

    if (approved) {
      // Approve the rejection → mark as REJECTED
      const updated = await this.prisma.serviceRequest.update({
        where: { id: requestId },
        data: {
          status: RequestStatus.REJECTED,
          rejectReason: request.rejectionRequestReason,
          rejectionRequestedBy: null,
          rejectionRequestedAt: null,
          rejectionRequestReason: null,
        },
      });

      // Notify the client via WhatsApp
      const serviceName = SERVICES_DATA.find(s => s.id === request.serviceId)?.name || 'الخدمة المطلوبة';
      let message = `مرحباً بك أستاذ/ة *${request.user.name}* 👋\n\n`;
      message += `نود إعلامك بتحديث حالة طلبك لدى *رسّام آرت للاستشارات الهندسية* 📐\n\n`;
      message += `📌 *الخدمة:* ${serviceName}\n`;
      message += `📍 *المنطقة:* ${request.region?.name || 'غير محدد'}\n`;
      message += `🔢 *رقم الطلب:* #${request.id}\n\n`;
      message += `❌ *حالة الطلب:* نعتذر، تم رفض الطلب\n`;
      if (request.rejectionRequestReason) {
        message += `📝 *السبب:* ${request.rejectionRequestReason}\n`;
      }
      message += `\nنتمنى لكم التوفيق، ونسعد بخدمتكم في طلبات أخرى.`;

      this.whatsapp.sendMessage(request.user.phone, message).catch(() => {});

      return updated;
    } else {
      // Reject the rejection request → back to PENDING
      return this.prisma.serviceRequest.update({
        where: { id: requestId },
        data: {
          status: RequestStatus.PENDING,
          rejectionRequestedBy: null,
          rejectionRequestedAt: null,
          rejectionRequestReason: null,
        },
      });
    }
  }
}
