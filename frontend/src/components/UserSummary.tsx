import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { timeAPI } from '../services/api';
import { useTimeLog } from '../contexts/TimeLogContext';
import { PayPeriodCalculator, PayPeriodType } from '../utils/payPeriod';
import { debug, debugError } from '../utils/debug';
// Identity & sign-out are handled globally in Header to avoid duplication.

interface UserStats {
  totalHours: number;
  currentPeriodHours: number;
  pendingEntries: number;
  lastClockIn?: string;
  lastClockOut?: string | null;
  payPeriodDescription: string;
  hourlyRate: number;
  taxRate: number;
  overtimeRate: number;
}

interface TimeEntry {
  id: number;
  clockIn: string; // ISO string from API
  clockOut: string | null;
  hoursWorked?: string | number | null;
  isManual?: boolean;
  approvalStatus?: string;
}

const UserSummary: React.FC = () => {
  const { user } = useAuth();
  const [payPeriodType] = useState<PayPeriodType>('bi-monthly'); // Default to bi-monthly
  const { refreshTrigger } = useTimeLog();
  const [stats, setStats] = useState<UserStats>({
    totalHours: 0,
    currentPeriodHours: 0,
    pendingEntries: 0,
    payPeriodDescription: '',
    hourlyRate: 0,
    taxRate: 25,
    overtimeRate: 1.5,
    lastClockOut: null
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserStats = async () => {
      try {
        const [entriesResponse, settingsResponse] = await Promise.all([
          timeAPI.getEntries(),
          timeAPI.getSettings()
        ]);
        
  const entries: TimeEntry[] = entriesResponse.data.entries || [];
        const userData = settingsResponse.data.user;
        
        // Debug logging
  debug('UserSummary - User data:', userData);
  debug('UserSummary - Hourly rate:', userData.hourlyRate, typeof userData.hourlyRate);
        
        // Get current pay period
        const currentPeriod = PayPeriodCalculator.getCurrentPayPeriod(payPeriodType);
        
        // Calculate total hours
        const totalHours = entries.reduce((sum: number, entry: TimeEntry) => {
          const value = entry.hoursWorked !== undefined && entry.hoursWorked !== null ? Number(entry.hoursWorked) : 0;
          return sum + (isNaN(value) ? 0 : value);
        }, 0);

        // Calculate current pay period hours
        const currentPeriodHours = entries
          .filter((entry: TimeEntry) => {
            const entryDate = new Date(entry.clockIn);
            return entryDate >= currentPeriod.startDate && entryDate <= currentPeriod.endDate;
          })
          .reduce((sum: number, entry: TimeEntry) => {
            const value = entry.hoursWorked !== undefined && entry.hoursWorked !== null ? Number(entry.hoursWorked) : 0;
            return sum + (isNaN(value) ? 0 : value);
          }, 0);

        // Count pending manual entries
        const pendingEntries = entries.filter(
          (entry: TimeEntry) => entry.isManual && entry.approvalStatus === 'pending'
        ).length;

    // Determine active vs last clock-out
    const activeEntry = entries.find((entry: TimeEntry) => entry.clockOut === null);
    const lastCompleted = entries.find((entry: TimeEntry) => entry.clockOut !== null);
        
        setStats({
          totalHours,
          currentPeriodHours,
          pendingEntries,
          lastClockIn: activeEntry?.clockIn,
          lastClockOut: !activeEntry ? lastCompleted?.clockOut || null : null,
          payPeriodDescription: PayPeriodCalculator.formatPeriodDescription(currentPeriod),
          hourlyRate: userData.hourlyRate || 0,
          taxRate: userData.taxRate || 25,
          overtimeRate: userData.overtimeRate || 1.5
        });
      } catch (error) {
        debugError('Failed to fetch user stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserStats();
  }, [payPeriodType, refreshTrigger]);

  const formatHours = (hours: number) => {
    return hours.toFixed(1);
  };

  const calculateEstimatedPay = (hours: number) => {
    // Validate all inputs are numbers and greater than 0
    const validHours = Number(hours) || 0;
    const validHourlyRate = Number(stats.hourlyRate) || 0;
    const validTaxRate = Number(stats.taxRate) || 25;
    const validOvertimeRate = Number(stats.overtimeRate) || 1.5;
    
    if (validHourlyRate <= 0 || validHours <= 0) return null;
    
    // Calculate pay with overtime consideration
    let grossPay: number;
    
    if (validHours <= 40) {
      // No overtime
      grossPay = validHours * validHourlyRate;
    } else {
      // Regular hours + overtime hours
      const regularHours = 40;
      const overtimeHours = validHours - 40;
      grossPay = (regularHours * validHourlyRate) + (overtimeHours * validHourlyRate * validOvertimeRate);
    }
    
    const netPay = grossPay * (1 - validTaxRate / 100);
    
    // Validate final calculations
    if (isNaN(grossPay) || isNaN(netPay) || grossPay < 0 || netPay < 0) {
      return null;
    }
    
    return {
      gross: grossPay,
      net: netPay
    };
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="card mb-6">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card mb-6">
      <div className="card-header">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Hello, {user?.firstName}! 👋
          </h2>
          <div className="text-sm text-gray-500">
            {new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </div>
        </div>
      </div>

      <div className="card-body">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Total Hours */}
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm font-medium text-blue-600">Total Hours</p>
              <p className="text-lg font-semibold text-blue-900">{formatHours(stats.totalHours)}</p>
              {(() => {
                const estimatedPay = calculateEstimatedPay(stats.totalHours);
                if (estimatedPay && estimatedPay.net > 0) {
                  return (
                    <p className="text-xs text-blue-600 mt-1">
                      Est. Net: ${estimatedPay.net.toFixed(0)}
                    </p>
                  );
                } else if (stats.totalHours > 0 && stats.hourlyRate <= 0) {
                  return (
                    <p className="text-xs text-blue-500 mt-1 italic">
                      Set pay rate in Settings
                    </p>
                  );
                } else if (stats.totalHours <= 0) {
                  return (
                    <p className="text-xs text-blue-500 mt-1 italic">
                      No hours logged yet
                    </p>
                  );
                }
                return null;
              })()}
            </div>
          </div>
        </div>

        {/* Current Pay Period */}
        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm font-medium text-green-600">Current Period</p>
              <p className="text-lg font-semibold text-green-900">{formatHours(stats.currentPeriodHours)} hrs</p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-green-600">{stats.payPeriodDescription}</p>
                {(() => {
                  const estimatedPay = calculateEstimatedPay(stats.currentPeriodHours);
                  if (estimatedPay && estimatedPay.net > 0) {
                    return (
                      <p className="text-xs text-green-700 font-medium">
                        ~${estimatedPay.net.toFixed(0)}
                      </p>
                    );
                  } else if (stats.currentPeriodHours > 0 && stats.hourlyRate <= 0) {
                    return (
                      <p className="text-xs text-green-600 italic">
                        Setup pay
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Pending Approvals */}
        <div className="bg-yellow-50 rounded-lg p-4">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-yellow-600">Pending Requests</p>
              <p className="text-lg font-semibold text-yellow-900">{stats.pendingEntries}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Current Status */}
      {stats.lastClockIn ? (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center text-sm">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
            <span className="text-gray-600">Currently clocked in since</span>
            <span className="ml-1 font-medium text-gray-900">{formatDateTime(stats.lastClockIn)}</span>
          </div>
        </div>
      ) : stats.lastClockOut ? (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center text-sm">
            <div className="w-2 h-2 bg-gray-400 rounded-full mr-2"></div>
            <span className="text-gray-600">Last clock out at</span>
            <span className="ml-1 font-medium text-gray-900">{formatDateTime(stats.lastClockOut)}</span>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
};

export default UserSummary;