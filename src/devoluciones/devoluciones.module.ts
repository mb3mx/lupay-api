import { Module } from '@nestjs/common';
import { DevolucionesController } from './devoluciones.controller';
import { DevolucionesService } from './devoluciones.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DevolucionesController],
  providers: [DevolucionesService],
})
export class DevolucionesModule {}
