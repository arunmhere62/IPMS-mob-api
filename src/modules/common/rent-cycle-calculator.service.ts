import { Injectable } from '@nestjs/common';

/**
 * Service for calculating rent cycle dates based on CALENDAR or MIDMONTH patterns
 * Handles date calculations, validations, and next cycle predictions
 */
@Injectable()
export class RentCycleCalculatorService {
  /**
   * Parse date string in multiple formats
   * Supports: ISO (YYYY-MM-DDTHH:mm:ss), YYYY-MM-DD, DD MMM YYYY
   */
  parseDate(dateString: string): Date {
    if (!dateString) return new Date();

    // Try ISO format first
    if (dateString.includes('T')) {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    // Try YYYY-MM-DD format
    if (dateString.includes('-') && !dateString.includes('T')) {
      const [year, month, day] = dateString.split('-').map(Number);
      if (year && month && day) {
        return new Date(year, month - 1, day);
      }
    }

    // Try DD MMM YYYY format
    if (dateString.includes(' ')) {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    // Fallback
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? new Date() : date;
  }

  /**
   * Format date to YYYY-MM-DD string
   */
  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Get calendar month dates (1st to last day of month)
   * 
   * @param dateString - Any date in the desired month
   * @returns Object with start (1st) and end (last day) dates
   * 
   * @example
   * getCalendarMonthDates('2025-12-15')
   * // Returns: { start: '2025-12-01', end: '2025-12-31' }
   */
  getCalendarMonthDates(dateString: string): { start: string; end: string } {
    try {
      const date = this.parseDate(dateString);
      if (isNaN(date.getTime())) {
        console.warn('Invalid date parsed:', dateString);
        return { start: '', end: '' };
      }

      const year = date.getFullYear();
      const month = date.getMonth();

      const startDate = new Date(year, month, 1);           // 1st of month
      const endDate = new Date(year, month + 1, 0);         // Last day of month

      const result = {
        start: this.formatDate(startDate),
        end: this.formatDate(endDate),
      };

      console.log('Calendar dates calculated:', { input: dateString, ...result });
      return result;
    } catch (error) {
      console.error('Error calculating calendar dates:', error);
      return { start: '', end: '' };
    }
  }

  /**
   * Get midmonth dates (same day to same day next month - 1)
   * 
   * @param dateString - The starting day of the rent cycle
   * @returns Object with start and end dates
   * 
   * @example
   * getMidmonthDates('2025-12-15')
   * // Returns: { start: '2025-12-15', end: '2026-01-14' }
   */
  getMidmonthDates(dateString: string): { start: string; end: string } {
    try {
      let year: number, month: number, day: number;

      if (dateString.includes('-')) {
        // YYYY-MM-DD format
        const [y, m, d] = dateString.split('-').map(Number);
        year = y;
        month = m;
        day = d;
      } else {
        // Fallback to Date parsing
        const date = this.parseDate(dateString);
        if (isNaN(date.getTime())) {
          console.warn('Invalid date parsed:', dateString);
          return { start: '', end: '' };
        }
        year = date.getFullYear();
        month = date.getMonth() + 1;
        day = date.getDate();
      }

      // Start date is the input date
      const startMonth = String(month).padStart(2, '0');
      const startDay = String(day).padStart(2, '0');
      const startDateStr = `${year}-${startMonth}-${startDay}`;

      // Calculate end date: same day next month - 1
      let endMonth = month + 1;
      let endYear = year;
      if (endMonth > 12) {
        endMonth = 1;
        endYear = year + 1;
      }

      // Create a temporary date to handle day overflow (e.g., Jan 31 -> Feb 28)
      const tempDate = new Date(endYear, endMonth - 1, day);
      tempDate.setDate(tempDate.getDate() - 1);

      const endDateStr = this.formatDate(tempDate);

      const result = {
        start: startDateStr,
        end: endDateStr,
      };

      console.log('Midmonth dates calculated:', { input: dateString, ...result });
      return result;
    } catch (error) {
      console.error('Error calculating midmonth dates:', error);
      return { start: '', end: '' };
    }
  }

  /**
   * Get next rent cycle dates based on cycle type
   * 
   * @param lastEndDate - End date of the previous rent period
   * @param cycleType - 'CALENDAR' or 'MIDMONTH'
   * @param numCycles - Number of cycles to advance (usually 1)
   * @returns Object with startDate and endDate of next cycle
   * 
   * @example
   * getNextRentCycleDates('2025-12-31', 'CALENDAR', 1)
   * // Returns: { startDate: '2026-01-01', endDate: '2026-01-31' }
   */
  getNextRentCycleDates(
    lastEndDate: string,
    cycleType: 'CALENDAR' | 'MIDMONTH',
    numCycles: number = 1,
  ): { startDate: string; endDate: string } {
    void numCycles;
    try {
      const lastEnd = this.parseDate(lastEndDate);

      // Next cycle starts the day after last cycle ended
      const nextStart = new Date(lastEnd);
      nextStart.setDate(nextStart.getDate() + 1);

      let startDate = this.formatDate(nextStart);
      let endDate = '';

      if (cycleType === 'CALENDAR') {
        // For calendar: get the last day of the month
        const dates = this.getCalendarMonthDates(startDate);
        startDate = dates.start;
        endDate = dates.end;
      } else {
        // For midmonth: use the same day logic
        const dates = this.getMidmonthDates(startDate);
        startDate = dates.start;
        endDate = dates.end;
      }

      return { startDate, endDate };
    } catch (error) {
      console.error('Error calculating next rent cycle dates:', error);
      return { startDate: '', endDate: '' };
    }
  }

  /**
   * Validate rent period dates against cycle type
   * 
   * @param startDate - Start date of rent period
   * @param endDate - End date of rent period
   * @param cycleType - 'CALENDAR' or 'MIDMONTH'
   * @returns Object with isValid boolean and error message if invalid
   * 
   * @example
   * validateRentPeriod('2025-12-01', '2025-12-31', 'CALENDAR')
   * // Returns: { isValid: true, error: null }
   */
  validateRentPeriod(
    startDate: string,
    endDate: string,
    cycleType: 'CALENDAR' | 'MIDMONTH',
  ): { isValid: boolean; error: string | null } {
    try {
      const start = this.parseDate(startDate);
      const end = this.parseDate(endDate);

      // Basic validation
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return { isValid: false, error: 'Invalid date format' };
      }

      if (start >= end) {
        return { isValid: false, error: 'Start date must be before end date' };
      }

      if (cycleType === 'CALENDAR') {
        // Validate calendar cycle
        const startDay = start.getDate();
        const startMonth = start.getMonth();
        const startYear = start.getFullYear();

        const endDay = end.getDate();
        const endMonth = end.getMonth();
        const endYear = end.getFullYear();

        const isFirstOfMonth = startDay === 1;
        const lastDayOfMonth = new Date(startYear, startMonth + 1, 0).getDate();
        const isLastDayOfMonth =
          endDay === lastDayOfMonth && endMonth === startMonth && endYear === startYear;

        if (!isFirstOfMonth || !isLastDayOfMonth) {
          return {
            isValid: false,
            error: 'CALENDAR cycle: Period must be from 1st to last day of the month',
          };
        }
      } else {
        // Validate midmonth cycle
        const startDay = start.getDate();
        const startMonth = start.getMonth();
        const startYear = start.getFullYear();

        const endDay = end.getDate();
        const endMonth = end.getMonth();
        const endYear = end.getFullYear();
        void endDay;
        void endMonth;
        void endYear;

        // Calculate expected end date
        const expectedEndDate = new Date(startYear, startMonth + 1, startDay);
        expectedEndDate.setDate(expectedEndDate.getDate() - 1);

        // Check if end date matches expected (with 1 day tolerance)
        const dayDiff =
          Math.abs(end.getTime() - expectedEndDate.getTime()) / (1000 * 60 * 60 * 24);

        if (dayDiff > 1) {
          const expectedDay = startDay === 1 ? 30 : startDay - 1;
          return {
            isValid: false,
            error: `MIDMONTH cycle: Period should be from ${startDay}th to ${expectedDay}th of next month`,
          };
        }
      }

      return { isValid: true, error: null };
    } catch (error) {
      console.error('Error validating rent period:', error);
      return { isValid: false, error: 'Validation error' };
    }
  }

  /**
   * Calculate number of days in rent period
   * 
   * @param startDate - Start date string
   * @param endDate - End date string
   * @returns Number of days (inclusive)
   */
  calculateDaysInPeriod(startDate: string, endDate: string): number {
    try {
      const start = this.parseDate(startDate);
      const end = this.parseDate(endDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 for inclusive
      return diffDays;
    } catch (error) {
      console.error('Error calculating days in period:', error);
      return 0;
    }
  }

  /**
   * Get all rent periods for a year
   * 
   * @param year - Year number
   * @param cycleType - 'CALENDAR' or 'MIDMONTH'
   * @param startingDay - Starting day for MIDMONTH (ignored for CALENDAR)
   * @returns Array of rent periods
   */
  getYearlyRentPeriods(
    year: number,
    cycleType: 'CALENDAR' | 'MIDMONTH',
    startingDay: number = 1,
  ): Array<{ start: string; end: string; month: number }> {
    const periods: Array<{ start: string; end: string; month: number }> = [];

    if (cycleType === 'CALENDAR') {
      // 12 calendar months
      for (let month = 1; month <= 12; month++) {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        periods.push({
          start: this.formatDate(startDate),
          end: this.formatDate(endDate),
          month,
        });
      }
    } else {
      // MIDMONTH: 12 periods starting from startingDay
      for (let month = 1; month <= 12; month++) {
        const startDate = new Date(year, month - 1, startingDay);
        const endDate = new Date(year, month, startingDay);
        endDate.setDate(endDate.getDate() - 1);

        periods.push({
          start: this.formatDate(startDate),
          end: this.formatDate(endDate),
          month,
        });
      }
    }

    return periods;
  }

  /**
   * Get cycle type description
   * 
   * @param cycleType - 'CALENDAR' or 'MIDMONTH'
   * @returns Human-readable description
   */
  getCycleTypeDescription(cycleType: 'CALENDAR' | 'MIDMONTH'): string {
    if (cycleType === 'CALENDAR') {
      return '📅 Calendar (1st - Last day of month)';
    } else {
      return '🔄 Mid-Month (Any day - Same day next month - 1)';
    }
  }
}
