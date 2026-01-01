import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { LocationModule } from './modules/location/location.module';
import { PgLocationModule } from './modules/pg-location/pg-location.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { RoomModule } from './modules/room/room.module';
import { BedModule } from './modules/bed/bed.module';
import { ExpenseModule } from './modules/expense/expense.module';
import { EmployeeModule } from './modules/employee/employee.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { VisitorModule } from './modules/visitor/visitor.module';
import { TicketModule } from './modules/ticket/ticket.module';
import { NotificationModule } from './modules/notification/notification.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { PaymentGatewayModule } from './modules/payment-gateway/payment-gateway.module';
import { RolesModule } from './modules/roles/roles.module';
import { LegalDocumentsModule } from './modules/legal-documents/legal-documents.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { PgUsersModule } from './modules/pg-users/pg-users.module';
import { S3Module } from './s3/s3.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configuration,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    LocationModule,
    PgLocationModule,
    OrganizationModule,
    TenantModule,
    RoomModule,
    BedModule,
    ExpenseModule,
    EmployeeModule,
    PayrollModule,
    VisitorModule,
    TicketModule,
    NotificationModule,
    SubscriptionModule,
    PaymentGatewayModule,
    RolesModule,
    LegalDocumentsModule,
    RbacModule,
    PgUsersModule,
    S3Module,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
