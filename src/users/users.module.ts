import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PermissionsModule],
  controllers: [UsersController],
})
export class UsersModule {}
