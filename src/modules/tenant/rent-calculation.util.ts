export class RentCalculationUtil {
  /**
   * Convert date to UTC date only (time set to 00:00:00.000Z)
   */
  static toDateOnlyUtc(d: Date): Date {
    return new Date(d.toISOString().split('T')[0] + 'T00:00:00.000Z');
  }

  /**
   * Get inclusive days between two dates
   */
  static getInclusiveDays(start: Date, end: Date): number {
    const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.floor((endUtc - startUtc) / (1000 * 60 * 60 * 24)) + 1;
  }

  /**
   * Compute prorated amount for a month based on days in period
   */
  static computeProratedAmountForMonth(monthlyPrice: number, start: Date, end: Date): number {
    if (monthlyPrice <= 0) return 0;

    const s = this.toDateOnlyUtc(start);
    const e = this.toDateOnlyUtc(end);

    const year = s.getUTCFullYear();
    const month = s.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const daysInPeriod = this.getInclusiveDays(s, e);

    return (monthlyPrice / daysInMonth) * daysInPeriod;
  }

  /**
   * Compute expected due from allocations
   * For MIDMONTH cycles, uses full bed price without proration
   * For CALENDAR cycles, uses proration based on calendar month boundaries
   */
  static computeExpectedDueFromAllocations(params: {
    periodStart: Date;
    periodEnd: Date;
    cycleType: 'CALENDAR' | 'MIDMONTH';
    allocations: Array<{
      effective_from: Date;
      effective_to: Date | null;
      bed_price_snapshot: unknown;
    }>;
  }): number {
    const { periodStart, periodEnd, cycleType, allocations } = params;

    if (!allocations || allocations.length === 0) return 0;

    const start = this.toDateOnlyUtc(periodStart);
    const end = this.toDateOnlyUtc(periodEnd);

    // For MIDMONTH cycles, use full bed price from allocation without proration
    if (cycleType === 'MIDMONTH') {
      const latestAllocation = allocations[allocations.length - 1];
      const price = latestAllocation?.bed_price_snapshot
        ? Number(latestAllocation.bed_price_snapshot)
        : 0;
      return this.moneyRound2(price);
    }

    // For CALENDAR cycles, use proration logic
    // Find allocations overlapping the period
    const overlaps = allocations
      .map((a) => ({
        from: this.toDateOnlyUtc(new Date(a.effective_from)),
        to: a.effective_to ? this.toDateOnlyUtc(new Date(a.effective_to)) : null,
        price: a.bed_price_snapshot ? Number(a.bed_price_snapshot) : 0,
      }))
      .filter((a) => {
        const aTo = a.to ?? end;
        return a.from <= end && aTo >= start;
      })
      .sort((a, b) => a.from.getTime() - b.from.getTime());

    if (overlaps.length === 0) return 0;

    // Compute due by splitting by allocation and by month boundaries
    let total = 0;
    overlaps.forEach((a) => {
      const segStart = a.from > start ? a.from : start;
      const segEnd = (a.to ?? end) < end ? (a.to ?? end) : end;
      if (segStart > segEnd) return;

      let cursor = new Date(segStart);
      while (cursor <= segEnd) {
        const y = cursor.getUTCFullYear();
        const m = cursor.getUTCMonth();

        const monthStart = new Date(Date.UTC(y, m, 1));
        const monthEnd = new Date(Date.UTC(y, m + 1, 0));

        const partStart = cursor > monthStart ? cursor : monthStart;
        const partEnd = segEnd < monthEnd ? segEnd : monthEnd;

        total += this.computeProratedAmountForMonth(a.price, partStart, partEnd);

        // move to next day after this month-part
        const next = new Date(partEnd);
        next.setUTCDate(next.getUTCDate() + 1);
        cursor = next;
      }
    });

    return Math.round((total + Number.EPSILON) * 100) / 100;
  }

  /**
   * Round money to 2 decimal places
   */
  static moneyRound2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
}
