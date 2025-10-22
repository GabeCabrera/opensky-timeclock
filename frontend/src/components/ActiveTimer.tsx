import React, { useState, useEffect } from 'react';
import { useTimeLog } from '../contexts/TimeLogContext';

const ActiveTimer: React.FC = () => {
  const [elapsedTime, setElapsedTime] = useState<string>('00:00:00');
  const { status } = useTimeLog();

  // Extract active entry and status from context
  const isActive = status?.status === 'clocked-in';
  const activeEntry = status?.activeEntry;

  // Timer effect that calculates from server clock-in time but handles timezone properly
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isActive && activeEntry) {
      const updateTimer = () => {
        // The server sends UTC time, but we need to compare it with local time
        // The key insight: both times should be in the same timezone for comparison
        
        const utcClockIn = new Date(activeEntry.clockIn); // This is UTC time
        const now = new Date(); // This is local time
        
        // Convert UTC clock-in time to local time for proper comparison
        // getTimezoneOffset() returns minutes, and it's the offset FROM UTC
        // So if you're UTC-6, getTimezoneOffset() returns 360 (positive)
        const timezoneOffsetMs = now.getTimezoneOffset() * 60 * 1000;
        const localClockIn = new Date(utcClockIn.getTime() - timezoneOffsetMs);
        
        const diffMs = now.getTime() - localClockIn.getTime();
        
        if (diffMs < 0) {
          setElapsedTime('00:00:00');
          return;
        }
        
        const totalSeconds = Math.floor(diffMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        setElapsedTime(timeString);
      };

      // Update immediately
      updateTimer();
      // Then update every second
      interval = setInterval(updateTimer, 1000);
    } else {
      setElapsedTime('00:00:00');
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isActive, activeEntry]);

  if (!isActive || !activeEntry) {
    return null;
  }

  const formatClockInTime = (dateString: string) => {
    // Handle timezone conversion for display
    let displayTime: Date;
    if (dateString.endsWith('Z')) {
      // UTC time - convert to local for display
      const utcTime = new Date(dateString);
      const localOffset = utcTime.getTimezoneOffset() * 60 * 1000;
      displayTime = new Date(utcTime.getTime() + localOffset);
    } else {
      displayTime = new Date(dateString);
    }
    
    return displayTime.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="card">
      <div className="flex items-center space-x-4">
        {/* Status indicator */}
        <div className="flex items-center space-x-2">
          <div className="relative">
            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
            <div className="absolute inset-0 h-2 w-2 bg-green-500 rounded-full animate-ping opacity-75"></div>
          </div>
          <span className="badge-success">ACTIVE</span>
        </div>

        {/* Timer display */}
        <div className="flex items-center space-x-3">
          <div className="text-2xl font-mono font-bold text-gray-900">
            {elapsedTime}
          </div>
          <div className="text-sm text-gray-500">
            since {formatClockInTime(activeEntry.clockIn)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActiveTimer;