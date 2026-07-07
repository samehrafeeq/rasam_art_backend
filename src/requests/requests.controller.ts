import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestStatus, Role } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { DEFAULT_PERMISSIONS } from '../auth/permissions';

@Controller('requests')
@UseGuards(AuthGuard)
export class RequestsController {
  constructor(
    private readonly requestsService: RequestsService,
    private readonly prisma: PrismaService
  ) {}

  @Post()
  create(
    @Request() req,
    @Body() createData: { regionId: number; serviceId: number; message?: string },
  ) {
    return this.requestsService.create({
      userId: req.user.sub,
      regionId: createData.regionId,
      serviceId: createData.serviceId,
      message: createData.message,
    });
  }

  @Get()
  async findAll(
    @Request() req,
    @Query('userId') userId?: string,
    @Query('regionId') regionId?: string,
    @Query('status') status?: RequestStatus,
  ) {
    const user = req.user;

    // Regular USER can only see their own requests
    if (user.role === 'USER') {
      return this.requestsService.findAll({
        userId: user.sub,
        status,
      });
    }

    // For non-USER roles, check if they have requests.view permission
    if (user.role !== 'ADMIN') {
      const perms = new Set<string>(DEFAULT_PERMISSIONS[user.role] || []);
      const overrides = await this.prisma.rolePermission.findMany({
        where: { role: user.role as Role }
      });
      
      for (const override of overrides) {
        if (override.granted) perms.add(override.permission);
        else perms.delete(override.permission);
      }
      
      if (!perms.has('requests.view')) {
        throw new ForbiddenException('لا تملك صلاحية عرض الطلبات');
      }
    }

    // Branch-scoped roles (EMPLOYEE, BRANCH_MANAGER) see only their branch
    if ((user.role === 'EMPLOYEE' || user.role === 'BRANCH_MANAGER') && user.regionId) {
      return this.requestsService.findAll({
        regionId: user.regionId,
        status,
      });
    }

    // ADMIN sees everything (with optional filters)
    return this.requestsService.findAll({
      userId: userId ? +userId : undefined,
      regionId: regionId ? +regionId : undefined,
      status,
    });
  }

  /**
   * Accept a request directly.
   * Requires 'requests.accept' permission.
   */
  @Patch(':id/accept')
  @UseGuards(PermissionsGuard)
  @RequirePermission('requests.accept')
  async acceptRequest(@Request() req, @Param('id') id: string) {
    // Branch-scoped users can only accept requests in their branch
    await this.assertBranchAccess(req.user, +id);
    return this.requestsService.updateStatus(+id, {
      status: RequestStatus.ACCEPTED,
    });
  }

  /**
   * Reject a request directly.
   * Requires 'requests.reject' permission (BRANCH_MANAGER / ADMIN).
   * Employees do NOT have this permission — they must use request-rejection.
   */
  @Patch(':id/reject')
  @UseGuards(PermissionsGuard)
  @RequirePermission('requests.reject')
  async rejectRequest(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { rejectReason?: string },
  ) {
    await this.assertBranchAccess(req.user, +id);
    return this.requestsService.updateStatus(+id, {
      status: RequestStatus.REJECTED,
      rejectReason: body.rejectReason,
    });
  }

  /**
   * Legacy endpoint for backward compatibility.
   * Routes to accept or reject based on body.status.
   */
  @Patch(':id/status')
  @UseGuards(PermissionsGuard)
  @RequirePermission('requests.accept')
  async updateStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() updateData: { status: RequestStatus; rejectReason?: string },
  ) {
    await this.assertBranchAccess(req.user, +id);

    if (updateData.status === RequestStatus.REJECTED) {
      // If the user is an EMPLOYEE (no reject permission), route to request-rejection
      if (req.user.role === 'EMPLOYEE') {
        return this.requestsService.requestRejection(+id, req.user.sub, updateData.rejectReason);
      }
    }

    return this.requestsService.updateStatus(+id, updateData);
  }

  /**
   * Employee requests a rejection (goes to PENDING_REJECTION).
   * This does NOT reject the request directly.
   */
  @Patch(':id/request-rejection')
  @UseGuards(PermissionsGuard)
  @RequirePermission('requests.accept')
  requestRejection(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.requestsService.requestRejection(+id, req.user.sub, body.reason);
  }

  /**
   * Branch Manager or Admin reviews a rejection request.
   * Approves (→ REJECTED) or rejects the rejection (→ PENDING).
   */
  @Patch(':id/review-rejection')
  @UseGuards(PermissionsGuard)
  @RequirePermission('requests.review_rejection')
  async reviewRejection(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { approved: boolean },
  ) {
    await this.assertBranchAccess(req.user, +id);
    return this.requestsService.reviewRejection(+id, body.approved);
  }

  /**
   * Ensure branch-scoped users can only act on requests in their branch.
   */
  private async assertBranchAccess(user: any, requestId: number) {
    if (user.role === 'ADMIN') return;

    if ((user.role === 'EMPLOYEE' || user.role === 'BRANCH_MANAGER') && user.regionId) {
      const request = await this.requestsService.findById(requestId);
      if (request && request.regionId !== user.regionId) {
        throw new ForbiddenException('لا يمكنك التعامل مع طلبات خارج فرعك');
      }
    }
  }
}
