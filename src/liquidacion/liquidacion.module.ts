import { Module } from '@nestjs/common';
import { LiquidacionController } from './liquidacion.controller';
import { LiquidacionService } from './liquidacion.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [LiquidacionController],
  providers: [LiquidacionService],
})
export class LiquidacionModule {}
