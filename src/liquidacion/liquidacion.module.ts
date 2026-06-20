import { Module } from '@nestjs/common';
import { LiquidacionController } from './liquidacion.controller';
import { LiquidacionService } from './liquidacion.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LiquidacionController],
  providers: [LiquidacionService],
})
export class LiquidacionModule {}
