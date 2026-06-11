import { Module } from '@nestjs/common';
import { SindicatosService } from './sindicatos.service';
import { SindicatosController } from './sindicatos.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [SindicatosService],
  controllers: [SindicatosController],
  exports: [SindicatosService],
})
export class SindicatosModule {}
