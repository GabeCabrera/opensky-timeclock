import React, { useState, useEffect } from 'react';
import { TimeEntry } from '../types';
import CustomDatePicker from './CustomDatePicker';

interface TimeEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (entry: TimeEntryFormData) => void;
  loading: boolean;
  entry?: TimeEntry | null;
  mode: 'create' | 'edit';
  serverError?: string;
}

export interface TimeEntryFormData {
  clockIn: string;
  clockOut: string;
}

interface InternalFormData {
  clockIn: Date | null;
  clockOut: Date | null;
}

const TimeEntryModal: React.FC<TimeEntryModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  loading,
  entry,
  mode,
  serverError = ''
}) => {
  const [formData, setFormData] = useState<InternalFormData>({
    clockIn: null,
    clockOut: null
  });
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  // Removed work description field per product decision

  // Helper function to convert UTC timestamp to local Date object
  const parseUTCToLocal = (utcTimestamp: string | null): Date | null => {
    if (!utcTimestamp) return null;
    return new Date(utcTimestamp);
  };

  // Helper function to convert Date object to UTC ISO string
  const formatToUTC = (date: Date | null): string => {
    if (!date) return '';
    return date.toISOString();
  };

  // Initialize form data when modal opens
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && entry) {
        setFormData({
          clockIn: parseUTCToLocal(entry.clockIn),
          clockOut: parseUTCToLocal(entry.clockOut)
        });
      } else {
        // Default to current time for new entries
        const now = new Date();
        setFormData({
          clockIn: now,
          clockOut: null
        });
      }
      setErrors({});
    }
  }, [isOpen, mode, entry]);

  const validateForm = (): boolean => {
    const newErrors: {[key: string]: string} = {};

    // Validate clock in
    if (!formData.clockIn) {
      newErrors.clockIn = 'Clock in time is required';
    }

    // Validate clock out - REQUIRED for manual entries
    if (!formData.clockOut) {
      newErrors.clockOut = 'Clock out time is required for manual entries';
    } else if (formData.clockIn && formData.clockOut <= formData.clockIn) {
      newErrors.clockOut = 'Clock out time must be after clock in time';
    } else if (formData.clockIn) {
      // Check if the time span is reasonable (not more than 24 hours)
      const diffHours = (formData.clockOut.getTime() - formData.clockIn.getTime()) / (1000 * 60 * 60);
      if (diffHours > 24) {
        newErrors.clockOut = 'Time entry cannot exceed 24 hours';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      // Convert Date objects to UTC strings before submitting
      const submitData: TimeEntryFormData = {
        clockIn: formatToUTC(formData.clockIn),
        clockOut: formatToUTC(formData.clockOut)
      };
      onSubmit(submitData);
    }
  };

  const handleInputChange = (field: keyof InternalFormData, value: Date | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const calculateDuration = (): string => {
    if (!formData.clockIn || !formData.clockOut) return '';
    
    if (formData.clockOut <= formData.clockIn) return '';
    
    const diffMs = formData.clockOut.getTime() - formData.clockIn.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    return `${diffHours.toFixed(2)} hours`;
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal">
        {/* Header */}
        <div className="modal-header">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <svg className="w-5 h-5 mr-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {mode === 'create' ? 'Add Time Entry' : 'Edit Time Entry'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={loading}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="modal-body">
          {/* Server Error Alert */}
          {serverError && (
            <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
              <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-red-800 mb-1">Unable to Save</h4>
                <p className="text-sm text-red-700">{serverError}</p>
              </div>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Clock In Time */}
            <div>
              <label className="form-label">
                Clock In Time *
              </label>
              <CustomDatePicker
                selected={formData.clockIn}
                onChange={(date: Date | null) => handleInputChange('clockIn', date)}
                placeholder="Select clock in time"
                disabled={loading}
                maxDate={new Date()}
                error={!!errors.clockIn}
                required
              />
              {errors.clockIn && (
                <p className="mt-1 text-sm text-red-600">{errors.clockIn}</p>
              )}
            </div>

            {/* Clock Out Time */}
            <div>
              <label className="form-label">
                Clock Out Time
                <span className="text-red-500 ml-1">*</span>
              </label>
              <CustomDatePicker
                selected={formData.clockOut}
                onChange={(date: Date | null) => handleInputChange('clockOut', date)}
                placeholder="Select clock out time"
                disabled={loading}
                minDate={formData.clockIn || undefined}
                maxDate={new Date()}
                error={!!errors.clockOut}
                required
              />
              {errors.clockOut && (
                <p className="mt-1 text-sm text-red-600">{errors.clockOut}</p>
              )}
              {calculateDuration() && (
                <p className="mt-1 text-sm text-green-600 font-medium">
                  Duration: {calculateDuration()}
                </p>
              )}
            </div>


            {/* Action Buttons */}
            {/* Action Buttons */}
            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary flex-1"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary flex-1"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {mode === 'create' ? 'Creating...' : 'Updating...'}
                  </>
                ) : (
                  mode === 'create' ? 'Create Entry' : 'Update Entry'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TimeEntryModal;