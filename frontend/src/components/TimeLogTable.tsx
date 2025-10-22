import React, { useState, useEffect, useMemo } from 'react';
import { timeAPI } from '../services/api';
import { TimeEntry } from '../types';
import { useTimeLog } from '../contexts/TimeLogContext';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import TimeEntryModal, { TimeEntryFormData } from './TimeEntryModal';
import { useToasts } from '../contexts/ToastContext';
import { PayPeriodCalculator, PayPeriod } from '../utils/payPeriod';

const TimeLogTable: React.FC = () => {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<TimeEntry | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  // Removed work description feature
  const [timeEntryModalOpen, setTimeEntryModalOpen] = useState(false);
  const [timeEntryModalMode, setTimeEntryModalMode] = useState<'create' | 'edit'>('create');
  const [entryToEdit, setEntryToEdit] = useState<TimeEntry | null>(null);
  const [timeEntryLoading, setTimeEntryLoading] = useState(false);
  const [modalError, setModalError] = useState<string>('');
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set(['current']));
  const { refreshTrigger, triggerRefresh } = useTimeLog();
  const { push: pushToast } = useToasts();

  const fetchEntries = async () => {
    try {
      const response = await timeAPI.getEntries();
      setEntries(response.data.entries);
      // Clear transient info after refresh so old notices don't linger too long
      if (info && info.startsWith('Entry flagged')) {
        setTimeout(() => setInfo(''), 4000);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch time entries');
    } finally {
      setLoading(false);
    }
  };

  // Listen for refresh triggers from other components
  useEffect(() => {
    fetchEntries();
  }, [refreshTrigger]);

  const handleDeleteClick = (entry: TimeEntry) => {
    setEntryToDelete(entry);
    setDeleteDialogOpen(true);
  };

  // Description handlers removed

  const handleDeleteConfirm = async () => {
    if (!entryToDelete) return;

    setDeleteLoading(true);
    try {
      await timeAPI.deleteEntry(entryToDelete.id);
      setDeleteDialogOpen(false);
      setEntryToDelete(null);
      // Trigger refresh to update the list
      triggerRefresh();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete time entry');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setEntryToDelete(null);
  };

  const handleAddEntryClick = () => {
    setTimeEntryModalMode('create');
    setEntryToEdit(null);
    setModalError('');
    setTimeEntryModalOpen(true);
  };

  const handleEditClick = (entry: TimeEntry) => {
    setTimeEntryModalMode('edit');
    setEntryToEdit(entry);
    setModalError('');
    setTimeEntryModalOpen(true);
  };

  const handleTimeEntryModalClose = () => {
    setTimeEntryModalOpen(false);
    setEntryToEdit(null);
    setModalError('');
  };

  const handleTimeEntrySubmit = async (formData: TimeEntryFormData) => {
    setTimeEntryLoading(true);
    try {
      if (timeEntryModalMode === 'create') {
        const resp = await timeAPI.createEntry(
          formData.clockIn,
          formData.clockOut || undefined
        );
        const approvalStatus = resp.data?.entry?.approvalStatus;
        if (approvalStatus === 'pending') {
          pushToast({ type: 'info', message: 'Manual entry submitted for admin review.' });
        } else {
          pushToast({ type: 'success', message: 'Time entry created.' });
        }
      } else if (entryToEdit) {
        const resp = await timeAPI.updateEntry(
          entryToEdit.id,
          formData.clockIn,
          formData.clockOut || undefined
        );
        if (resp.status === 202 && resp.data?.reviewFlagged) {
          pushToast({ type: 'info', message: 'Changes flagged for admin review.' });
        }
        else if (resp.data?.entry?.approvalStatus === 'pending') {
          pushToast({ type: 'info', message: 'Entry updated and pending admin review.' });
        } else {
          pushToast({ type: 'success', message: 'Time entry updated.' });
        }
      }
      
      setTimeEntryModalOpen(false);
      setEntryToEdit(null);
      setModalError('');
      triggerRefresh();
    } catch (err: any) {
      const errorCode = err.response?.data?.code;
      const errorMessage = err.response?.data?.error || `Failed to ${timeEntryModalMode} time entry`;
      
      // For overlap and validation errors, keep modal open and show error inline ONLY (no toast, no global error)
      if (errorCode === 'OVERLAP' || errorCode === 'CLOCK_ORDER' || errorCode === 'ACTIVE_EDIT_FORBIDDEN') {
        setModalError(errorMessage);
        // Modal stays open, error shows inline only
      } else {
        // For other errors, close modal and show global error
        setTimeEntryModalOpen(false);
        setError(errorMessage);
        pushToast({ type: 'error', message: errorMessage });
      }
    } finally {
      setTimeEntryLoading(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      time: date.toLocaleTimeString('en-US', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    };
  };

  const calculateDuration = (clockIn: string, clockOut: string | null) => {
    if (!clockOut) return 'In Progress';
    
    const inTime = new Date(clockIn);
    const outTime = new Date(clockOut);
    const diffMs = outTime.getTime() - inTime.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Group entries by pay period
  const groupedEntries = useMemo(() => {
    const groups: { [key: string]: { period: PayPeriod; entries: TimeEntry[]; totalHours: number } } = {};
    
    entries.forEach(entry => {
      const entryDate = new Date(entry.clockIn);
      const period = PayPeriodCalculator.getCurrentPayPeriod('bi-monthly'); // Default to bi-monthly
      
      // Find which pay period this entry belongs to
      // We'll generate pay periods going back several months
      const periods: PayPeriod[] = [];
      const now = new Date();
      
      // Generate periods for the last 6 months
      for (let i = 0; i < 12; i++) {
        const checkDate = new Date(now.getFullYear(), now.getMonth() - Math.floor(i / 2), i % 2 === 0 ? 16 : 1);
        const p = PayPeriodCalculator.getCurrentPayPeriod('bi-monthly');
        
        // Manually calculate the period for this date
        const year = checkDate.getFullYear();
        const month = checkDate.getMonth();
        const day = checkDate.getDate();
        
        let periodStart: Date;
        let periodEnd: Date;
        
        if (day <= 15) {
          periodStart = new Date(year, month, 1, 0, 0, 0, 0);
          periodEnd = new Date(year, month, 15, 23, 59, 59, 999);
        } else {
          periodStart = new Date(year, month, 16, 0, 0, 0, 0);
          periodEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
        }
        
        periods.push({
          startDate: periodStart,
          endDate: periodEnd,
          description: 'Bi-Monthly'
        });
      }
      
      // Find the period this entry belongs to
      const matchingPeriod = periods.find(p => 
        entryDate >= p.startDate && entryDate <= p.endDate
      );
      
      if (matchingPeriod) {
        const key = `${matchingPeriod.startDate.toISOString()}_${matchingPeriod.endDate.toISOString()}`;
        
        if (!groups[key]) {
          groups[key] = {
            period: matchingPeriod,
            entries: [],
            totalHours: 0
          };
        }
        
        groups[key].entries.push(entry);
        
        // Calculate total hours for this period
        if (entry.clockOut) {
          const duration = new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime();
          groups[key].totalHours += duration / (1000 * 60 * 60);
        }
      }
    });
    
    // Sort groups by period start date (newest first)
    return Object.entries(groups).sort((a, b) => 
      b[1].period.startDate.getTime() - a[1].period.startDate.getTime()
    );
  }, [entries]);

  const togglePeriod = (periodKey: string) => {
    setExpandedPeriods(prev => {
      const newSet = new Set(prev);
      if (newSet.has(periodKey)) {
        newSet.delete(periodKey);
      } else {
        newSet.add(periodKey);
      }
      return newSet;
    });
  };

  const isPeriodCurrent = (period: PayPeriod) => {
    const now = new Date();
    return now >= period.startDate && now <= period.endDate;
  };

  if (loading) {
    return (
      <div className="card animate-fade-in">
        <div className="card-body">
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin h-8 w-8 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="ml-3 text-gray-500">Loading time entries...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card animate-fade-in">
        <div className="card-body">
          <div className="alert-error">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
          {info && (
            <div className="mt-4 alert-info">
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 2a7 7 0 100 14A7 7 0 009 2zM8 5h2v2H8V5zm0 4h2v4H8V9z" />
              </svg>
              <span>{info}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card animate-slide-up">
      <div className="card-header">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <svg className="w-5 h-5 mr-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Time Log
          </h3>
          <button
            onClick={handleAddEntryClick}
            className="btn-primary btn-sm"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Entry
          </button>
        </div>
      </div>
      
      {info && (
        <div className="px-6 py-4">
          <div className="alert-info mb-4">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 2a7 7 0 100 14A7 7 0 009 2zM8 5h2v2H8V5zm0 4h2v4H8V9z" />
            </svg>
            <span>{info}</span>
          </div>
        </div>
      )}
      {entries.length === 0 ? (
        <div className="card-body">
          <div className="text-center py-16">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No time entries yet</h3>
            <p className="text-gray-500 text-sm mb-6 max-w-sm mx-auto">
              Clock in to start tracking your time, or add an entry manually to get started.
            </p>
            <button
              onClick={handleAddEntryClick}
              className="btn-primary"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Your First Entry
            </button>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {groupedEntries.map(([periodKey, { period, entries: periodEntries, totalHours }], index) => {
            const isCurrent = isPeriodCurrent(period);
            const isExpanded = expandedPeriods.has(periodKey) || (index === 0 && isCurrent);
            
            return (
              <div key={periodKey} className="bg-white">
                {/* Pay Period Header (Collapsible) */}
                <button
                  onClick={() => togglePeriod(periodKey)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <svg 
                      className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'transform rotate-90' : ''}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <div className="text-left">
                      <h4 className="text-sm font-semibold text-gray-900">
                        {PayPeriodCalculator.formatPeriodDescription(period)}
                        {isCurrent && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            Current Period
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {periodEntries.length} {periodEntries.length === 1 ? 'entry' : 'entries'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-900">
                      {totalHours.toFixed(2)}h
                    </div>
                    <div className="text-xs text-gray-500">Total Hours</div>
                  </div>
                </button>

                {/* Pay Period Content (Collapsible Table) */}
                {isExpanded && (
                  <div className="overflow-x-auto border-t border-gray-200">
                    <table className="table">
                      <thead className="table-header bg-gray-50">
                        <tr>
                          <th>Date</th>
                          <th>Clock In</th>
                          <th>Clock Out</th>
                          <th>Duration</th>
                          <th className="hidden sm:table-cell">Hours</th>
                          <th className="text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="table-body">
                        {periodEntries.map((entry) => {
                          const clockInFormatted = formatDateTime(entry.clockIn);
                          const clockOutFormatted = entry.clockOut ? formatDateTime(entry.clockOut) : null;
                          const isActive = !entry.clockOut;
                          
                          return (
                            <tr 
                              key={entry.id} 
                              className={isActive ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-gray-50'}
                            >
                              <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {clockInFormatted.date}
                              </td>
                              <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-mono text-gray-900">{clockInFormatted.time}</div>
                              </td>
                              <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                                {clockOutFormatted ? (
                                  <div className="text-sm font-mono text-gray-900">{clockOutFormatted.time}</div>
                                ) : (
                                  <div className="flex items-center">
                                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2"></div>
                                    <span className="text-sm text-green-600 font-medium">In Progress</span>
                                  </div>
                                )}
                              </td>
                              <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-mono text-gray-900">
                                  {calculateDuration(entry.clockIn, entry.clockOut)}
                                </div>
                              </td>
                              <td className="hidden sm:table-cell px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {entry.hoursWorked ? `${entry.hoursWorked}h` : '-'}
                              </td>
                              <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <div className="flex items-center justify-end space-x-3">
                                  {/* Status tag on the left */}
                                  {entry.isManual ? (
                                    <span className={`inline-flex items-center px-2 py-1 rounded ${
                                      entry.approvalStatus === 'pending' 
                                        ? 'bg-yellow-100 text-yellow-800' 
                                        : entry.approvalStatus === 'approved'
                                        ? 'bg-green-100 text-green-800'
                                        : entry.approvalStatus === 'denied'
                                        ? 'bg-red-100 text-red-800'
                                        : 'bg-gray-100 text-gray-800'
                                    }`}>
                                      {entry.approvalStatus === 'pending' && (
                                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <circle cx="12" cy="12" r="10" />
                                          <path d="M12 8v4M12 16h.01" />
                                        </svg>
                                      )}
                                      {entry.approvalStatus === 'approved' && (
                                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M20 6L9 17l-5-5" />
                                        </svg>
                                      )}
                                      {entry.approvalStatus === 'denied' && (
                                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M18 6L6 18M6 6l12 12" />
                                        </svg>
                                      )}
                                      {!entry.approvalStatus && 'Manual'}
                                    </span>
                                  ) : (
                                    entry.clockOut ? (
                                      <span className="inline-flex items-center px-2 py-1 rounded bg-green-100 text-green-800">
                                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M20 6L9 17l-5-5" />
                                        </svg>
                                      </span>
                                    ) : null
                                  )}
                                  
                                  {/* Action buttons on the right */}
                                  <div className="flex items-center space-x-2">
                                    {entry.clockOut ? (
                                      <>
                                        <button
                                          onClick={() => handleEditClick(entry)}
                                          className="text-blue-600 hover:text-blue-900 transition-colors"
                                          title={entry.approvalStatus === 'denied' ? 'Edit and resubmit for approval' : 'Edit this time entry'}
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                          </svg>
                                        </button>
                                        <button
                                          onClick={() => handleDeleteClick(entry)}
                                          className="text-red-600 hover:text-red-900 transition-colors"
                                          title="Delete this time entry"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                        </button>
                                      </>
                                    ) : (
                                      <span className="text-green-600 text-xs font-medium uppercase tracking-wide">
                                        Active
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      
      <DeleteConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        entryDate={entryToDelete ? formatDateTime(entryToDelete.clockIn).date : ''}
        loading={deleteLoading}
      />

      {/* WorkDescriptionViewModal removed */}

      <TimeEntryModal
        isOpen={timeEntryModalOpen}
        onClose={handleTimeEntryModalClose}
        onSubmit={handleTimeEntrySubmit}
        loading={timeEntryLoading}
        entry={entryToEdit}
        mode={timeEntryModalMode}
        serverError={modalError}
      />
    </div>
  );
};

export default TimeLogTable;