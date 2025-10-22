import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { timeAPI } from '../services/api';
import { StatusResponse } from '../types';

interface TimeLogContextType {
  refreshTrigger: number;
  triggerRefresh: () => void;
  status: StatusResponse | null;
  updateStatus: () => Promise<void>;
}

const TimeLogContext = createContext<TimeLogContextType | undefined>(undefined);

export const useTimeLog = () => {
  const context = useContext(TimeLogContext);
  if (context === undefined) {
    throw new Error('useTimeLog must be used within a TimeLogProvider');
  }
  return context;
};

interface TimeLogProviderProps {
  children: ReactNode;
}

export const TimeLogProvider: React.FC<TimeLogProviderProps> = ({ children }) => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [status, setStatus] = useState<StatusResponse | null>(null);

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const updateStatus = async () => {
    try {
      const response = await timeAPI.getStatus();
      setStatus(response.data);
    } catch (error) {
      // Handle error silently
    }
  };

  // Initial status fetch
  useEffect(() => {
    updateStatus();
  }, []);

  // SSE subscription for real-time updates (clock in/out & manual entries)
  useEffect(() => {
    const es = timeAPI.openTimeStream?.();
    if (!es) return; // Fallback: polling only

    const handleClockIn = (e: MessageEvent) => {
      try { JSON.parse(e.data); } catch (_) { return; }
      updateStatus();
      triggerRefresh();
    };
    const handleClockOut = (e: MessageEvent) => {
      try { JSON.parse(e.data); } catch (_) { return; }
      updateStatus();
      triggerRefresh();
    };
    const handleManualCreated = (e: MessageEvent) => {
      try { JSON.parse(e.data); } catch (_) { return; }
      // A new manual entry affects lists & possibly stats
      triggerRefresh();
    };
    const handleManualUpdated = (e: MessageEvent) => {
      try { JSON.parse(e.data); } catch (_) { return; }
      triggerRefresh();
    };
    const handleStatus = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setStatus(data);
      } catch (_) {}
    };

    es.addEventListener('clock-in', handleClockIn);
    es.addEventListener('clock-out', handleClockOut);
    es.addEventListener('manual-entry-created', handleManualCreated);
    es.addEventListener('manual-entry-updated', handleManualUpdated);
    es.addEventListener('status', handleStatus);

    es.onerror = () => {
      // Allow automatic browser retry; no manual reconnect here
    };
    return () => {
      es.removeEventListener('clock-in', handleClockIn);
      es.removeEventListener('clock-out', handleClockOut);
      es.removeEventListener('manual-entry-created', handleManualCreated);
      es.removeEventListener('manual-entry-updated', handleManualUpdated);
      es.removeEventListener('status', handleStatus);
      es.close();
    };
  }, []);

  // Update status when refresh is triggered
  useEffect(() => {
    if (refreshTrigger > 0) {
      updateStatus();
    }
  }, [refreshTrigger]);

  const value = {
    refreshTrigger,
    triggerRefresh,
    status,
    updateStatus,
  };

  return <TimeLogContext.Provider value={value}>{children}</TimeLogContext.Provider>;
};