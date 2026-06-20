import { Module } from '@nestjs/common';
import { LiquidadorasService } from './liquidadoras.service';
import { LiquidadorasController } from './liquidadoras.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [LiquidadorasService],
  controllers: [LiquidadorasController],
  exports: [LiquidadorasService],
})
export class LiquidadorasModule {}
