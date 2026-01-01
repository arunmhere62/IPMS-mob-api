import { Module } from '@nestjs/common';
import { PgUsersController } from './pg-users.controller';
import { PgUsersService } from './pg-users.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PgUsersController],
  providers: [PgUsersService],
  exports: [PgUsersService],
})
export class PgUsersModule {}
