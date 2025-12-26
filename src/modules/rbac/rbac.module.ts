import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';
import { RbacPermissionsController } from './permissions/rbac-permissions.controller';
import { UserPermissionOverridesController } from './overrides/user-permission-overrides.controller';
import { UserPermissionOverridesService } from './overrides/user-permission-overrides.service';

@Module({
  imports: [PrismaModule],
  controllers: [RbacController, RbacPermissionsController, UserPermissionOverridesController],
  providers: [RbacService, UserPermissionOverridesService],
  exports: [RbacService, UserPermissionOverridesService],
})
export class RbacModule {}
