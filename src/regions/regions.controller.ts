import { Controller, Get, Post, Body, Patch, Param, Delete, Put, UseGuards } from '@nestjs/common';
import { RegionsService } from './regions.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';

@Controller('regions')
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('regions.create')
  @Post()
  create(@Body() createRegionDto: { name: string; description?: string; phoneNumbers?: string; whatsappInstanceId?: number | null }) {
    return this.regionsService.create(createRegionDto);
  }

  @Get()
  findAll() {
    // PUBLIC endpoint for the frontend services page
    return this.regionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.regionsService.findOne(+id);
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('regions.edit')
  @Put(':id')
  update(@Param('id') id: string, @Body() updateRegionDto: { name?: string; description?: string; phoneNumbers?: string; disabledServiceIds?: any; whatsappInstanceId?: number | null }) {
    return this.regionsService.update(+id, updateRegionDto);
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('regions.delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.regionsService.remove(+id);
  }
}
