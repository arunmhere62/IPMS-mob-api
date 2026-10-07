import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeatureToursController } from './feature-tours.controller';
import { FeatureToursService } from './feature-tours.service';

@Module({
  imports: [AuthModule],
  controllers: [FeatureToursController],
  providers: [FeatureToursService, HeadersValidationGuard, JwtAuthGuard],
  exports: [FeatureToursService],
})
export class FeatureToursModule {}
