import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTimeLog } from '../contexts/TimeLogContext';
import { timeAPI } from '../services/api';
import { debugError } from '../utils/debug';

const ClockInOut: React.FC = () => {
  const { user } = useAuth();
  const { status, triggerRefresh, updateStatus } = useTimeLog();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleClockIn = async () => {
    if (!user || isProcessing) return;

    setIsProcessing(true);
    try {
      await timeAPI.clockIn();
      await updateStatus();
      triggerRefresh();
    } catch (error) {
      debugError('Clock in error:', error);
      // Handle error appropriately
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClockOut = async () => {
    if (!user || !status?.activeEntry || isProcessing) return;

    setIsProcessing(true);
    try {
      await timeAPI.clockOut();
      await updateStatus();
      triggerRefresh();
    } catch (error) {
      debugError('Clock out error:', error);
      // Handle error appropriately
    } finally {
      setIsProcessing(false);
    }
  };

  const isActivelyClockedIn = status?.status === 'clocked-in' && !!status?.activeEntry;

  return (
    <div className="flex items-center space-x-3">
      {isActivelyClockedIn ? (
        <button
          onClick={handleClockOut}
          disabled={isProcessing}
          className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 shadow-sm"
        >
          {isProcessing ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Clocking Out...
            </>
          ) : (
            <>
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Clock Out
            </>
          )}
        </button>
      ) : (
        <button
          onClick={handleClockIn}
          disabled={isProcessing}
          className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 shadow-sm"
        >
          {isProcessing ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Clocking In...
            </>
          ) : (
            <>
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Clock In
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default ClockInOut;