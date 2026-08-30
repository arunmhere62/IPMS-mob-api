import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CouponController } from './coupon.controller';
import { CouponService } from './coupon.service';

@Module({
  controllers: [CouponController],
  providers: [CouponService, PrismaService],
  exports: [CouponService],
})
export class CouponModule {}
