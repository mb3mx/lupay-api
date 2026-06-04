import { Module } from '@nestjs/common';
import { ContracargosController } from './contracargos.controller';
import { ContracargosService } from './contracargos.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ContracargosController],
  providers: [ContracargosService],
})
export class ContracargosModule {}
