import { Module } from '@nestjs/common';
import { CancelacionesController } from './cancelaciones.controller';
import { CancelacionesService } from './cancelaciones.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CancelacionesController],
  providers: [CancelacionesService],
})
export class CancelacionesModule {}
