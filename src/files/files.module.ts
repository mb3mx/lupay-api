import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ClientsModule } from '../clients/clients.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { SettlementsModule } from '../settlements/settlements.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    ClientsModule,
    TransactionsModule,
    SettlementsModule,
    NotificationsModule,
  ],
  providers: [FilesService],
  controllers: [FilesController],
  exports: [FilesService],
})
export class FilesModule {}
