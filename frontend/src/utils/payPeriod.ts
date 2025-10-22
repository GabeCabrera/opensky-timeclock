export type PayPeriodType = 'weekly' | 'bi-weekly' | 'bi-monthly' | 'monthly';

export interface PayPeriod {
  startDate: Date;
  endDate: Date;
  description: string;
}

export class PayPeriodCalculator {
  static getCurrentPayPeriod(type: PayPeriodType = 'bi-monthly'): PayPeriod {
    const now = new Date();
    
    switch (type) {
      case 'weekly':
        return this.getWeeklyPeriod(now);
      case 'bi-weekly':
        return this.getBiWeeklyPeriod(now);
      case 'bi-monthly':
        return this.getBiMonthlyPeriod(now);
      case 'monthly':
        return this.getMonthlyPeriod(now);
      default:
        return this.getBiMonthlyPeriod(now);
    }
  }

  private static getWeeklyPeriod(date: Date): PayPeriod {
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday
    endOfWeek.setHours(23, 59, 59, 999);
    
    return {
      startDate: startOfWeek,
      endDate: endOfWeek,
      description: 'Weekly'
    };
  }

  private static getBiWeeklyPeriod(date: Date): PayPeriod {
    // Assuming pay periods start on Sundays
    // This is a simplified implementation - in practice you'd want to store the company's specific bi-weekly start date
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    // Determine if this is week 1 or 2 of the pay period
    const weekOfYear = Math.ceil((date.getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
    const isOddWeek = weekOfYear % 2 === 1;
    
    let periodStart: Date;
    if (isOddWeek) {
      periodStart = new Date(startOfWeek);
    } else {
      periodStart = new Date(startOfWeek);
      periodStart.setDate(startOfWeek.getDate() - 7);
    }
    
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodStart.getDate() + 13);
    periodEnd.setHours(23, 59, 59, 999);
    
    return {
      startDate: periodStart,
      endDate: periodEnd,
      description: 'Bi-Weekly'
    };
  }

  private static getBiMonthlyPeriod(date: Date): PayPeriod {
    const currentDay = date.getDate();
    const year = date.getFullYear();
    const month = date.getMonth();
    
    let startDate: Date;
    let endDate: Date;
    
    if (currentDay <= 15) {
      // First half of month (1st - 15th)
      startDate = new Date(year, month, 1, 0, 0, 0, 0);
      endDate = new Date(year, month, 15, 23, 59, 59, 999);
    } else {
      // Second half of month (16th - end of month)
      startDate = new Date(year, month, 16, 0, 0, 0, 0);
      endDate = new Date(year, month + 1, 0, 23, 59, 59, 999); // Last day of current month
    }
    
    return {
      startDate,
      endDate,
      description: 'Bi-Monthly'
    };
  }

  private static getMonthlyPeriod(date: Date): PayPeriod {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    const startDate = new Date(year, month, 1, 0, 0, 0, 0);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999); // Last day of month
    
    return {
      startDate,
      endDate,
      description: 'Monthly'
    };
  }

  static formatPeriodDescription(period: PayPeriod): string {
    const startStr = period.startDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
    const endStr = period.endDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
    
    return `${startStr} - ${endStr}`;
  }

  static getAllPayPeriodTypes(): { value: PayPeriodType; label: string }[] {
    return [
      { value: 'weekly', label: 'Weekly' },
      { value: 'bi-weekly', label: 'Bi-Weekly (Every 2 weeks)' },
      { value: 'bi-monthly', label: 'Bi-Monthly (1st & 15th)' },
      { value: 'monthly', label: 'Monthly' }
    ];
  }
}