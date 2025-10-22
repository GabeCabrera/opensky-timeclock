export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  isAdmin?: boolean;
  isSuperUser?: boolean;
  isProvisioned?: boolean;
  provisionTokenExpires?: string;
  createdAt: string;
  // Pay settings
  hourlyRate?: number;
  taxRate?: number;
  paySchedule?: string;
  overtimeEnabled?: boolean;
  overtimeRate?: number;
  // Preferences
  timeFormat?: string;
  timezone?: string;
  emailNotifications?: boolean;
  // Contact (may be partially present in list views)
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  mobilePhone?: string;
  stats?: {
    totalEntries: number;
    manualEntries: number;
  };
}

// Detailed user response (full profile)
export interface DetailedUser extends User {
  stats: {
    totalEntries: number;
    manualEntries: number;
  };
}

export interface TimeEntry {
  id: number;
  clockIn: string;
  clockOut: string | null;
  hoursWorked: string | null;
  isManual?: boolean;
  approvalStatus?: 'pending' | 'approved' | 'denied';
  approvalNotes?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  user?: {
    firstName: string;
    lastName: string;
    email: string;
  };
  createdAt?: string;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

export interface TimeEntriesResponse {
  entries: TimeEntry[];
}

export interface StatusResponse {
  status: 'clocked-in' | 'clocked-out';
  activeEntry: {
    id: number;
    clockIn: string;
  } | null;
}

// Payroll period hours aggregation response
export interface PayrollPeriodUser {
  userId: number;
  schedule: string;
  periodStart: string;
  periodEnd: string;
  hours: number;          // total hours in period
  regularHours: number;   // hours up to overtime threshold
  overtimeHours: number;  // hours beyond threshold (if enabled)
  estGross: number;       // estimated gross pay (regular + overtime * 1.5)
  hourlyRate: number;     // echoed rate (for convenience)
  overtimeEnabled: boolean;
}

export interface PayrollPeriodResponse {
  period: { generatedAt: string };
  users: PayrollPeriodUser[];
}