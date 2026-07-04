import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ElectricityBillController } from './electricity-bill.controller';
import { ElectricityBillService } from './electricity-bill.service';

@Module({
  imports: [PrismaModule],
  controllers: [ElectricityBillController],
  providers: [ElectricityBillService],
  exports: [ElectricityBillService],
})
export class ElectricityBillModule {}
