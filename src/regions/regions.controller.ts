import { Controller, Get, Post, Body, Patch, Param, Delete, Put, UseGuards } from '@nestjs/common';
import { RegionsService } from './regions.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('regions')
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  @UseGuards(AuthGuard)
  @Post()
  create(@Body() createRegionDto: { name: string; description?: string; phoneNumbers?: string }) {
    return this.regionsService.create(createRegionDto);
  }

  @Get()
  findAll() {
    return this.regionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.regionsService.findOne(+id);
  }

  @UseGuards(AuthGuard)
  @Put(':id')
  update(@Param('id') id: string, @Body() updateRegionDto: { name?: string; description?: string; phoneNumbers?: string; disabledServiceIds?: any }) {
    return this.regionsService.update(+id, updateRegionDto);
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.regionsService.remove(+id);
  }
}
