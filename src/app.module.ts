import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { RegionsModule } from './regions/regions.module';
import { RequestsModule } from './requests/requests.module';
import { ContactModule } from './contact/contact.module';
import { PermissionsModule } from './permissions/permissions.module';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, WhatsappModule, RegionsModule, RequestsModule, ContactModule, PermissionsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
