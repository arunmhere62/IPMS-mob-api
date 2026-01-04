import { Injectable } from '@nestjs/common';

type TenantForDashboardClassification = {
  status?: unknown;
  partial_due_amount?: unknown;
  pending_due_amount?: unknown;
  unpaid_months?: unknown;
};

@Injectable()
export class DashboardTenantStatusService {
  classify(params: { tenants: unknown[] }): { pendingRentTenants: unknown[]; partialRentTenants: unknown[] } {
    const tenants = params.tenants || [];

    const pendingRentTenants = tenants.filter((t) => {
      const tenant = t as TenantForDashboardClassification;
      const status = String(tenant?.status || '');
      if (status !== 'ACTIVE') return false;

      const partialDue = Number(tenant?.partial_due_amount || 0);
      if (partialDue > 0) return false;

      const pendingDue = Number(tenant?.pending_due_amount || 0);
      const unpaidMonthsCount = Array.isArray(tenant?.unpaid_months) ? (tenant?.unpaid_months || []).length : 0;
      return pendingDue > 0 || unpaidMonthsCount > 0;
    });

    const partialRentTenants = tenants.filter((t) => {
      const tenant = t as TenantForDashboardClassification;
      const status = String(tenant?.status || '');
      if (status !== 'ACTIVE') return false;

      const partialDue = Number(tenant?.partial_due_amount || 0);
      return partialDue > 0;
    });

    return { pendingRentTenants, partialRentTenants };
  }
}
