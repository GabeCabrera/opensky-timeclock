import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { User } from '../types';
import { PayPeriodCalculator, PayPeriodType } from '../utils/payPeriod';

interface EditPaySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  employee: User | null;
}

interface PaySettings {
  hourlyRate: number;
  taxRate: number;
  paySchedule: PayPeriodType;
  overtimeEnabled: boolean;
}

const EditPaySettingsModal: React.FC<EditPaySettingsModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  employee
}) => {
  const [settings, setSettings] = useState<PaySettings>({
    hourlyRate: 0,
    taxRate: 25,
    paySchedule: 'bi-weekly',
    overtimeEnabled: false
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && employee) {
      fetchEmployeeSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, employee]);

  const fetchEmployeeSettings = async () => {
    if (!employee) return;
    
    setLoading(true);
    setError('');
    
    try {
      const response = await adminAPI.getUserSettings(employee.id);
      const userData = response.data.user;
      
      setSettings({
        hourlyRate: userData.hourlyRate || 0,
        taxRate: userData.taxRate || 25,
        paySchedule: userData.paySchedule as PayPeriodType || 'bi-weekly',
        overtimeEnabled: userData.overtimeEnabled || false
      });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load employee settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;

    setSaving(true);
    setError('');

    try {
      await adminAPI.updateUserSettings(employee.id, {
        hourlyRate: settings.hourlyRate,
        taxRate: settings.taxRate,
        paySchedule: settings.paySchedule,
        overtimeEnabled: settings.overtimeEnabled
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const calculatePayPreview = () => {
    const regularPay = 40 * settings.hourlyRate;
    const overtimePay = settings.overtimeEnabled ? 5 * settings.hourlyRate * 1.5 : 0;
    const grossPay = regularPay + overtimePay;
    const netPay = grossPay * (1 - settings.taxRate / 100);
    
    return {
      regular: regularPay.toFixed(2),
      overtime: overtimePay.toFixed(2),
      gross: grossPay.toFixed(2),
      net: netPay.toFixed(2)
    };
  };

  if (!isOpen) return null;

  const payPreview = calculatePayPreview();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            Edit Pay Settings - {employee?.firstName} {employee?.lastName}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-6 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Loading settings...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hourly Rate ($)
                </label>
                <input
                  type="number"
                  value={settings.hourlyRate}
                  onChange={(e) => setSettings({...settings, hourlyRate: parseFloat(e.target.value) || 0})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tax Rate (%)
                </label>
                <select
                  value={settings.taxRate}
                  onChange={(e) => setSettings({...settings, taxRate: parseFloat(e.target.value)})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={15}>15% (Low tax bracket)</option>
                  <option value={22}>22% (Standard bracket)</option>
                  <option value={25}>25% (Conservative estimate)</option>
                  <option value={30}>30% (Higher bracket)</option>
                  <option value={35}>35% (High earner)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pay Schedule
                </label>
                <select
                  value={settings.paySchedule}
                  onChange={(e) => setSettings({...settings, paySchedule: e.target.value as PayPeriodType})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {PayPeriodCalculator.getAllPayPeriodTypes().map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="overtimeEnabled"
                  checked={settings.overtimeEnabled}
                  onChange={(e) => setSettings({...settings, overtimeEnabled: e.target.checked})}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="overtimeEnabled" className="ml-2 block text-sm text-gray-700">
                  Overtime Enabled (1.5x after 40 hours)
                </label>
              </div>
            </div>

            {/* Pay Preview */}
            {settings.hourlyRate > 0 && (
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-3">Pay Preview (45 hours example)</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-blue-600">Regular (40hrs):</span>
                    <div className="font-semibold text-blue-900">${payPreview.regular}</div>
                  </div>
                  <div>
                    <span className="text-blue-600">Overtime (5hrs):</span>
                    <div className="font-semibold text-blue-900">${payPreview.overtime}</div>
                  </div>
                  <div>
                    <span className="text-blue-600">Gross Pay:</span>
                    <div className="font-semibold text-blue-900">${payPreview.gross}</div>
                  </div>
                  <div>
                    <span className="text-blue-600">Net Pay ({settings.taxRate}%):</span>
                    <div className="font-semibold text-green-600">${payPreview.net}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default EditPaySettingsModal;