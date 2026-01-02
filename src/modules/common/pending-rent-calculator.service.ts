import { Injectable } from '@nestjs/common';

export interface TenantPayment {
  s_no: number;
  payment_date: string;
  amount_paid: string | number;
  actual_rent_amount: string | number;
  start_date: string;
  end_date: string;
  payment_method: string;
  status: 'PAID' | 'PARTIAL' | 'PENDING' | 'FAILED' | 'OVERDUE' | 'REFUNDED';
  remarks?: string;
}

export interface AdvancePayment {
  s_no: number;
  payment_date: string;
  amount_paid: string | number;
  actual_rent_amount: string | number;
  payment_method: string;
  status: 'PAID' | 'PENDING' | 'FAILED' | 'PARTIAL';
  remarks?: string;
}

export interface PendingMonth {
  month: string; // Format: "2025-11" (YYYY-MM)
  monthName: string; // Format: "November 2025"
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  expectedAmount: number;
  paidAmount: number;
  pendingAmount: number;
  status: 'FULLY_PENDING' | 'PARTIALLY_PAID' | 'OVERDUE';
  daysPending: number;
  isOverdue: boolean;
  payments: TenantPayment[];
}

export interface PendingRentDetails {
  // Summary
  totalPendingAmount: number;
  totalPartialAmount: number;
  totalOverdueAmount: number;
  totalPendingMonths: number;
  totalOverdueMonths: number;
  
  // Monthly breakdown
  pendingMonths: PendingMonth[];
  
  // Status flags
  hasAnyPending: boolean;
  hasPartialPayments: boolean;
  hasOverduePayments: boolean;
  
  // Advance payment info
  totalAdvancePaid: number;
  hasAdvancePayment: boolean;
  advanceBalance: number; // Remaining advance that can be used
  
  // Next due information
  nextDueDate: string | null;
  nextDueAmount: number;
  
  // Grace period and penalties
  gracePeriodDays: number;
  penaltyAmount: number;
  
  // Payment history summary
  lastPaymentDate: string | null;
  lastPaymentAmount: number;
  totalPaymentsMade: number;
  averageMonthlyPayment: number;
  
  // Recommendations
  recommendedAction: 'NO_ACTION' | 'FOLLOW_UP' | 'URGENT_FOLLOW_UP' | 'NOTICE' | 'EVICTION_WARNING';
  recommendationReason: string;
}

@Injectable()
export class PendingRentCalculatorService {
  private readonly GRACE_PERIOD_DAYS = 5; // Days after due date before marking overdue
  private readonly PENALTY_RATE = 0.02; // 2% penalty per month

  /**
   * Calculate comprehensive pending rent details for a tenant
   */
  calculatePendingRentDetails(
    checkInDate: string,
    currentRentAmount: number,
    tenantPayments: TenantPayment[] = [],
    advancePayments: AdvancePayment[] = [],
    currentDate: Date = new Date()
  ): PendingRentDetails {
    const checkIn = new Date(checkInDate);
    const sortedPayments = this.sortPaymentsByDate(tenantPayments);
    const totalAdvancePaid = this.calculateTotalAdvancePaid(advancePayments);
    
    // Generate expected monthly periods from check-in to current date
    const expectedMonths = this.generateExpectedMonths(checkIn, currentDate, currentRentAmount);
    
    // Calculate pending months with detailed breakdown
    const pendingMonths = this.calculatePendingMonths(expectedMonths, sortedPayments, currentDate);
    
    // Calculate summary totals
    const summary = this.calculateSummaryTotals(pendingMonths);
    
    // Calculate advance balance
    const advanceBalance = Math.max(0, totalAdvancePaid - summary.totalPendingAmount);
    
    // Determine next due date and amount
    const nextDue = this.calculateNextDue(pendingMonths, currentDate, currentRentAmount);
    
    // Calculate penalty
    const penaltyAmount = this.calculatePenalty(pendingMonths);
    
    // Payment history analysis
    const paymentHistory = this.analyzePaymentHistory(sortedPayments);
    
    // Generate recommendation
    const recommendation = this.generateRecommendation(pendingMonths, summary, paymentHistory);

    return {
      // Summary
      totalPendingAmount: summary.totalPendingAmount,
      totalPartialAmount: summary.totalPartialAmount,
      totalOverdueAmount: summary.totalOverdueAmount,
      totalPendingMonths: summary.totalPendingMonths,
      totalOverdueMonths: summary.totalOverdueMonths,
      
      // Monthly breakdown
      pendingMonths,
      
      // Status flags
      hasAnyPending: summary.totalPendingAmount > 0,
      hasPartialPayments: summary.totalPartialAmount > 0,
      hasOverduePayments: summary.totalOverdueAmount > 0,
      
      // Advance payment info
      totalAdvancePaid,
      hasAdvancePayment: totalAdvancePaid > 0,
      advanceBalance,
      
      // Next due information
      nextDueDate: nextDue.date,
      nextDueAmount: nextDue.amount,
      
      // Grace period and penalties
      gracePeriodDays: this.GRACE_PERIOD_DAYS,
      penaltyAmount,
      
      // Payment history summary
      lastPaymentDate: paymentHistory.lastPaymentDate,
      lastPaymentAmount: paymentHistory.lastPaymentAmount,
      totalPaymentsMade: paymentHistory.totalPaymentsMade,
      averageMonthlyPayment: paymentHistory.averageMonthlyPayment,
      
      // Recommendations
      recommendedAction: recommendation.action,
      recommendationReason: recommendation.reason,
    };
  }

  private sortPaymentsByDate(payments: TenantPayment[]): TenantPayment[] {
    return [...payments].sort((a, b) => 
      new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    );
  }

  private calculateTotalAdvancePaid(advancePayments: AdvancePayment[]): number {
    return advancePayments
      .filter(payment => payment.status === 'PAID')
      .reduce((total, payment) => total + Number(payment.amount_paid), 0);
  }

  private generateExpectedMonths(
    checkInDate: Date, 
    currentDate: Date, 
    rentAmount: number
  ): Array<{ month: string; monthName: string; startDate: Date; endDate: Date; expectedAmount: number }> {
    const months = [];
    const current = new Date(checkInDate);
    
    while (current <= currentDate) {
      const year = current.getFullYear();
      const month = current.getMonth();
      
      // Calculate period start and end dates
      const startDate = new Date(current);
      const endDate = new Date(year, month + 1, current.getDate() - 1);
      
      // If end date is in the future, use current date
      if (endDate > currentDate) {
        endDate.setTime(currentDate.getTime());
      }

      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      const monthName = `${current.toLocaleString('default', { month: 'long' })} ${year}`;

      months.push({
        month: monthKey,
        monthName,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        expectedAmount: rentAmount,
      });

      // Move to next month
      current.setMonth(current.getMonth() + 1);
    }

    return months;
  }

  private calculatePendingMonths(
    expectedMonths: any[],
    payments: TenantPayment[],
    currentDate: Date
  ): PendingMonth[] {
    return expectedMonths.map(expectedMonth => {
      // Find payments for this month period
      const monthPayments = payments.filter(payment => {
        const paymentStart = new Date(payment.start_date);
        const paymentEnd = new Date(payment.end_date);
        
        return (
          (paymentStart >= expectedMonth.startDate && paymentStart <= expectedMonth.endDate) ||
          (paymentEnd >= expectedMonth.startDate && paymentEnd <= expectedMonth.endDate) ||
          (paymentStart <= expectedMonth.startDate && paymentEnd >= expectedMonth.endDate)
        );
      });

      // Calculate total paid amount for this month
      const paidAmount = monthPayments
        .filter(payment => payment.status === 'PAID' || payment.status === 'PARTIAL')
        .reduce((total, payment) => total + Number(payment.amount_paid), 0);

      const pendingAmount = Math.max(0, expectedMonth.expectedAmount - paidAmount);
      
      // Determine status
      let status: 'FULLY_PENDING' | 'PARTIALLY_PAID' | 'OVERDUE';
      if (paidAmount === 0) {
        status = 'FULLY_PENDING';
      } else if (paidAmount < expectedMonth.expectedAmount) {
        status = 'PARTIALLY_PAID';
      } else {
        status = 'FULLY_PENDING'; // This shouldn't happen if pendingAmount > 0
      }

      // Calculate days pending
      const daysPending = Math.max(0, 
        Math.floor((currentDate.getTime() - expectedMonth.endDate.getTime()) / (1000 * 60 * 60 * 24))
      );

      // Check if overdue (past grace period)
      const isOverdue = daysPending > this.GRACE_PERIOD_DAYS;
      if (isOverdue && pendingAmount > 0) {
        status = 'OVERDUE';
      }

      return {
        month: expectedMonth.month,
        monthName: expectedMonth.monthName,
        startDate: expectedMonth.startDate.toISOString(),
        endDate: expectedMonth.endDate.toISOString(),
        expectedAmount: expectedMonth.expectedAmount,
        paidAmount,
        pendingAmount,
        status,
        daysPending,
        isOverdue,
        payments: monthPayments,
      };
    }).filter(month => month.pendingAmount > 0); // Only return months with pending amounts
  }

  private calculateSummaryTotals(pendingMonths: PendingMonth[]) {
    return pendingMonths.reduce(
      (summary, month) => {
        summary.totalPendingAmount += month.pendingAmount;
        summary.totalPendingMonths += 1;

        if (month.status === 'PARTIALLY_PAID') {
          summary.totalPartialAmount += month.pendingAmount;
        }

        if (month.status === 'OVERDUE') {
          summary.totalOverdueAmount += month.pendingAmount;
          summary.totalOverdueMonths += 1;
        }

        return summary;
      },
      {
        totalPendingAmount: 0,
        totalPartialAmount: 0,
        totalOverdueAmount: 0,
        totalPendingMonths: 0,
        totalOverdueMonths: 0,
      }
    );
  }

  private calculateNextDue(
    pendingMonths: PendingMonth[],
    currentDate: Date,
    currentRentAmount: number
  ): { date: string | null; amount: number } {
    // If there are pending months, the next due is the earliest pending month
    if (pendingMonths.length > 0) {
      const earliestPending = pendingMonths.sort((a, b) => 
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      )[0];
      
      return {
        date: earliestPending.endDate,
        amount: earliestPending.pendingAmount,
      };
    }

    // If no pending months, calculate next month's due date
    const nextMonth = new Date(currentDate);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    
    return {
      date: nextMonth.toISOString(),
      amount: currentRentAmount,
    };
  }

  private calculatePenalty(pendingMonths: PendingMonth[]): number {
    return pendingMonths.reduce((totalPenalty, month) => {
      if (month.isOverdue) {
        const monthsOverdue = Math.ceil(month.daysPending / 30);
        const penalty = month.pendingAmount * this.PENALTY_RATE * monthsOverdue;
        return totalPenalty + penalty;
      }
      return totalPenalty;
    }, 0);
  }

  private analyzePaymentHistory(payments: TenantPayment[]) {
    const paidPayments = payments.filter(p => p.status === 'PAID' || p.status === 'PARTIAL');
    
    if (paidPayments.length === 0) {
      return {
        lastPaymentDate: null,
        lastPaymentAmount: 0,
        totalPaymentsMade: 0,
        averageMonthlyPayment: 0,
      };
    }

    const sortedByDate = paidPayments.sort((a, b) => 
      new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
    );

    const totalPaid = paidPayments.reduce((sum, payment) => sum + Number(payment.amount_paid), 0);

    return {
      lastPaymentDate: sortedByDate[0].payment_date,
      lastPaymentAmount: Number(sortedByDate[0].amount_paid),
      totalPaymentsMade: paidPayments.length,
      averageMonthlyPayment: totalPaid / paidPayments.length,
    };
  }

  private generateRecommendation(
    pendingMonths: PendingMonth[],
    summary: any,
    paymentHistory: any
  ): { action: 'NO_ACTION' | 'FOLLOW_UP' | 'URGENT_FOLLOW_UP' | 'NOTICE' | 'EVICTION_WARNING'; reason: string } {
    // No pending amounts
    if (summary.totalPendingAmount === 0) {
      return {
        action: 'NO_ACTION',
        reason: 'All payments are up to date',
      };
    }

    // Overdue payments
    if (summary.totalOverdueMonths > 2) {
      return {
        action: 'EVICTION_WARNING',
        reason: `${summary.totalOverdueMonths} months overdue with ₹${summary.totalOverdueAmount} pending`,
      };
    }

    if (summary.totalOverdueMonths > 0) {
      return {
        action: 'NOTICE',
        reason: `${summary.totalOverdueMonths} month(s) overdue, immediate payment required`,
      };
    }

    // Multiple pending months
    if (summary.totalPendingMonths > 1) {
      return {
        action: 'URGENT_FOLLOW_UP',
        reason: `${summary.totalPendingMonths} months pending, total ₹${summary.totalPendingAmount}`,
      };
    }

    // Single pending month
    return {
      action: 'FOLLOW_UP',
      reason: `₹${summary.totalPendingAmount} pending for current month`,
    };
  }

  /**
   * Get pending rent summary for multiple tenants
   */
  getBulkPendingRentSummary(tenants: any[]): any[] {
    return tenants.map(tenant => {
      const pendingDetails = this.calculatePendingRentDetails(
        tenant.check_in_date,
        Number(tenant.rooms?.rent_price || 0),
        tenant.rent_payments || [],
        tenant.advance_payments || []
      );

      return {
        ...tenant,
        pending_rent_details: pendingDetails,
        // Add quick access fields
        total_pending_amount: pendingDetails.totalPendingAmount,
        pending_months_count: pendingDetails.totalPendingMonths,
        is_overdue: pendingDetails.hasOverduePayments,
        recommended_action: pendingDetails.recommendedAction,
      };
    });
  }

  /**
   * Get tenants with specific pending rent criteria
   */
  filterTenantsByPendingRent(
    tenants: any[],
    criteria: {
      minPendingAmount?: number;
      maxPendingMonths?: number;
      includeOverdue?: boolean;
      includePartial?: boolean;
    }
  ): any[] {
    return this.getBulkPendingRentSummary(tenants).filter(tenant => {
      const details = tenant.pending_rent_details;
      
      if (criteria.minPendingAmount && details.totalPendingAmount < criteria.minPendingAmount) {
        return false;
      }
      
      if (criteria.maxPendingMonths && details.totalPendingMonths > criteria.maxPendingMonths) {
        return false;
      }
      
      if (criteria.includeOverdue !== undefined && details.hasOverduePayments !== criteria.includeOverdue) {
        return false;
      }
      
      if (criteria.includePartial !== undefined && details.hasPartialPayments !== criteria.includePartial) {
        return false;
      }
      
      return true;
    });
  }
}
