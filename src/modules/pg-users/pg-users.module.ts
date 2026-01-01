import { Module } from '@nestjs/common';
import { PgUsersService } from './pg-users.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PgUsersService],
  exports: [PgUsersService],
})
export class PgUsersModule {}
