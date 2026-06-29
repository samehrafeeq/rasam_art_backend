import { Controller, Get, Post, Body, Patch, Param, Query } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { RequestStatus } from '@prisma/client';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post()
  create(@Body() createData: { userId: number; regionId: number; serviceId: number; message?: string }) {
    return this.requestsService.create(createData);
  }

  @Get()
  findAll(
    @Query('userId') userId?: string,
    @Query('regionId') regionId?: string,
    @Query('status') status?: RequestStatus,
  ) {
    return this.requestsService.findAll({
      userId: userId ? +userId : undefined,
      regionId: regionId ? +regionId : undefined,
      status: status,
    });
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() updateData: { status: RequestStatus; rejectReason?: string }
  ) {
    return this.requestsService.updateStatus(+id, updateData);
  }
}
