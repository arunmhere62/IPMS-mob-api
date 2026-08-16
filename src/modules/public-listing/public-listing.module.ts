import { Module } from '@nestjs/common';
import { PublicListingController } from './public-listing.controller';
import { PublicListingService } from './public-listing.service';

@Module({
  controllers: [PublicListingController],
  providers: [PublicListingService],
  exports: [PublicListingService],
})
export class PublicListingModule {}
