import React, { useState, useEffect } from 'react';
import { timeAPI } from '../services/api';
import { PayPeriodType } from '../utils/payPeriod';
import { debugError } from '../utils/debug';

interface UserSettingsData {
  hourlyRate: number;
  taxRate: number;
  payPeriodType: PayPeriodType;
  overtimeRate: number;
  overtimeThreshold: number;
  emailNotifications: boolean;
  emailRejectionNotifications: boolean;
  timeFormat: '12h' | '24h';
  timezone: string;
  autoClockOutEnabled: boolean;
  autoClockOutTime: string;
  reminderNotifications: boolean;
  weekStartDay: 'sunday' | 'monday';
}

const UserSettings: React.FC = () => {
  const [settings, setSettings] = useState<UserSettingsData>({
    hourlyRate: 0,
    taxRate: 25,
    payPeriodType: 'bi-weekly',
    overtimeRate: 1.5,
    overtimeThreshold: 40,
    emailNotifications: true,
    emailRejectionNotifications: true,
    timeFormat: '12h',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    autoClockOutEnabled: false,
    autoClockOutTime: '18:00',
    reminderNotifications: true,
    weekStartDay: 'monday'
  });
  
  // Track original settings for change detection
  const [originalSettings, setOriginalSettings] = useState<UserSettingsData | null>(null);
  
  // Track if there are unsaved changes and confirmation dialog
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'pay' | 'preferences' | 'notifications'>('pay');
  // Tab configuration centralization
  const tabs: { id: 'pay' | 'preferences' | 'notifications'; label: string; icon: string }[] = [
    { id: 'pay', label: 'Pay & Benefits', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'preferences', label: 'Preferences', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    { id: 'notifications', label: 'Notifications', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' }
  ];

  const focusTabByOffset = (offset: number) => {
    const idx = tabs.findIndex(t => t.id === activeTab);
    if (idx === -1) return;
    const next = tabs[(idx + offset + tabs.length) % tabs.length];
    handleTabSwitch(next.id);
  };

  const handleTabKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); focusTabByOffset(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); focusTabByOffset(-1); }
  };

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await timeAPI.getSettings();
        const userData = response.data.user;
        
        const fetchedSettings: UserSettingsData = {
          hourlyRate: userData.hourlyRate || 0,
          taxRate: userData.taxRate || 25,
          payPeriodType: userData.paySchedule as PayPeriodType || 'bi-weekly',
          overtimeRate: userData.overtimeRate || 1.5,
          overtimeThreshold: 40,
          emailNotifications: userData.emailNotifications !== false,
          emailRejectionNotifications: userData.emailRejectionNotifications !== false,
          timeFormat: (userData.timeFormat === '24' ? '24h' : '12h') as '12h' | '24h',
          timezone: userData.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          autoClockOutEnabled: userData.autoClockOutEnabled === true,
          autoClockOutTime: userData.autoClockOutTime ? userData.autoClockOutTime.substring(0, 5) : '18:00',
          reminderNotifications: userData.reminderNotifications !== false,
          weekStartDay: userData.weekStartDay || 'monday'
        };
        
        setSettings(fetchedSettings);
        setOriginalSettings(fetchedSettings); // Store original for comparison
        setLoading(false);
      } catch (error) {
        debugError('Failed to fetch settings:', error);
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  // Check for changes whenever settings update
  useEffect(() => {
    if (originalSettings) {
      const hasChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);
      setHasUnsavedChanges(hasChanges);
    }
  }, [settings, originalSettings]);

  // Handle tab switching with unsaved changes
  const handleTabSwitch = (newTab: string) => {
    if (hasUnsavedChanges) {
      setPendingTab(newTab);
      setShowConfirmDialog(true);
    } else {
      setActiveTab(newTab as any);
    }
  };

  // Confirm navigation without saving
  const confirmNavigateWithoutSaving = () => {
    if (originalSettings) {
      setSettings({ ...originalSettings }); // Reset to original
    }
    setHasUnsavedChanges(false);
    setShowConfirmDialog(false);
    if (pendingTab) {
      setActiveTab(pendingTab as any);
      setPendingTab(null);
    }
  };

  // Cancel navigation
  const cancelNavigation = () => {
    setShowConfirmDialog(false);
    setPendingTab(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    
    try {
      await timeAPI.updateSettings({
        timeFormat: settings.timeFormat === '24h' ? '24' : '12',
        timezone: settings.timezone,
        emailNotifications: settings.emailNotifications,
        emailRejectionNotifications: settings.emailRejectionNotifications,
        reminderNotifications: settings.reminderNotifications,
        autoClockOutEnabled: settings.autoClockOutEnabled,
        autoClockOutTime: settings.autoClockOutTime,
        weekStartDay: settings.weekStartDay
      });
      setMessage('Settings saved successfully!');
      setOriginalSettings({ ...settings }); // Update original after successful save
      setHasUnsavedChanges(false);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      debugError('Failed to save settings:', error);
      setMessage('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container-md py-6 pb-40 space-y-6">
        {/* Header Card */}
        <div className="card animate-fade-in">
          <div className="card-header">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
              <p className="mt-1 text-sm text-gray-600">
                Manage your account preferences and view your compensation information.
              </p>
            </div>
          </div>
          
          {/* Navigation Tabs (responsive) */}
          <div className="border-b border-gray-200 overflow-x-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-200">
            <nav
              className="flex md:px-6 px-2 -mb-px md:space-x-8 space-x-2 min-w-max"
              role="tablist"
              aria-label="Settings sections"
              onKeyDown={handleTabKeyDown}
            >
              {tabs.map(tab => {
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={selected}
                    aria-controls={`panel-${tab.id}`}
                    id={`tab-${tab.id}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => handleTabSwitch(tab.id)}
                    className={`group inline-flex items-center md:py-4 py-3 md:px-1 px-3 rounded-md md:rounded-none border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${selected ? 'border-blue-500 text-blue-600 bg-blue-50 md:bg-transparent' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50 md:hover:bg-transparent'}`}
                  >
                    <svg className={`w-5 h-5 mr-2 ${selected ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                    </svg>
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Content Card */}
        <div className="card animate-slide-up">
          <div className="card-body">
        
        {/* Pay & Benefits Tab */}
        {activeTab === 'pay' && (
          <>
            <div className="border-b border-gray-200 pb-4 mb-6">
              <h2 className="text-lg font-medium text-gray-900">Pay Information</h2>
            </div>
            
            {/* Pay information content */}
            {settings.hourlyRate > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-semibold text-gray-900">${(Number(settings.hourlyRate) || 0).toFixed(2)}</div>
                    <div className="text-sm text-gray-600">Hourly Rate</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-semibold text-gray-900">{Number(settings.taxRate) || 25}%</div>
                    <div className="text-sm text-gray-600">Tax Rate</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-semibold text-gray-900 capitalize">{settings.payPeriodType.replace('-', ' ')}</div>
                    <div className="text-sm text-gray-600">Pay Schedule</div>
                  </div>
                </div>

                <div className="bg-blue-50 rounded-lg p-4">
                  <h3 className="font-medium text-blue-900 mb-3">Pay Calculation Example (45 hours)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-blue-600">Regular Pay (40hrs):</span>
                      <div className="font-semibold text-blue-900">${(40 * (Number(settings.hourlyRate) || 0)).toFixed(2)}</div>
                    </div>
                    <div>
                      <span className="text-blue-600">Overtime (5hrs @ {Number(settings.overtimeRate) || 1.5}x):</span>
                      <div className="font-semibold text-blue-900">${(5 * (Number(settings.hourlyRate) || 0) * (Number(settings.overtimeRate) || 1.5)).toFixed(2)}</div>
                    </div>
                    <div>
                      <span className="text-blue-600">Gross Pay:</span>
                      <div className="font-semibold text-blue-900">
                        ${(40 * (Number(settings.hourlyRate) || 0) + 5 * (Number(settings.hourlyRate) || 0) * (Number(settings.overtimeRate) || 1.5)).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <span className="text-blue-600">Est. Net ({Number(settings.taxRate) || 25}% tax):</span>
                      <div className="font-semibold text-green-600">
                        ${((40 * (Number(settings.hourlyRate) || 0) + 5 * (Number(settings.hourlyRate) || 0) * (Number(settings.overtimeRate) || 1.5)) * (1 - (Number(settings.taxRate) || 25) / 100)).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-yellow-400 mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div className="text-yellow-800">
                    <strong>Pay information not set up.</strong> Please contact your administrator to configure your hourly rate and pay settings.
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Preferences Tab */}
        {activeTab === 'preferences' && (
          <>
            <div className="border-b border-gray-200 pb-4 mb-6">
              <h2 className="text-lg font-medium text-gray-900">Display Preferences</h2>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time Format
                </label>
                <select
                  value={settings.timeFormat}
                  onChange={(e) => setSettings({...settings, timeFormat: e.target.value as '12h' | '24h'})}
                  className="block w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="12h">12 Hour (2:30 PM)</option>
                  <option value="24h">24 Hour (14:30)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Timezone
                </label>
                <select
                  value={settings.timezone}
                  onChange={(e) => setSettings({...settings, timezone: e.target.value})}
                  className="block w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="America/New_York">Eastern Time</option>
                  <option value="America/Chicago">Central Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Los_Angeles">Pacific Time</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Week Start Day
                </label>
                <select
                  value={settings.weekStartDay}
                  onChange={(e) => setSettings({...settings, weekStartDay: e.target.value as 'sunday' | 'monday'})}
                  className="block w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="monday">Monday</option>
                  <option value="sunday">Sunday</option>
                </select>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-md font-medium text-gray-900 mb-4">Auto Clock-Out</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-700">Enable Auto Clock-Out</div>
                      <div className="text-sm text-gray-500">Automatically clock out at a specified time if you forget</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.autoClockOutEnabled}
                        onChange={(e) => setSettings({...settings, autoClockOutEnabled: e.target.checked})}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  
                  {settings.autoClockOutEnabled && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Auto Clock-Out Time
                      </label>
                      <input
                        type="time"
                        value={settings.autoClockOutTime}
                        onChange={(e) => setSettings({...settings, autoClockOutTime: e.target.value})}
                        className="block w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Save Button for Preferences */}
            {hasUnsavedChanges && (
              <div className="mt-8 pt-6 border-t border-gray-200 hidden md:block">
                <div className="flex justify-between items-center">
                  {message && (
                    <div className={`text-sm ${message.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
                      {message}
                    </div>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="ml-auto bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save Preferences'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <>
            <div className="border-b border-gray-200 pb-4 mb-6">
              <h2 className="text-lg font-medium text-gray-900">Notification Settings</h2>
            </div>
            
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-700">Email Notifications</div>
                  <div className="text-sm text-gray-500">Receive email notifications for time entry approvals</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.emailNotifications}
                    onChange={(e) => setSettings({...settings, emailNotifications: e.target.checked})}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-700">Rejection Notifications</div>
                  <div className="text-sm text-gray-500">Receive email notifications when time entries are rejected</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.emailRejectionNotifications}
                    onChange={(e) => setSettings({...settings, emailRejectionNotifications: e.target.checked})}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-700">Reminder Notifications</div>
                  <div className="text-sm text-gray-500">Receive reminders to clock in/out and submit timesheets</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.reminderNotifications}
                    onChange={(e) => setSettings({...settings, reminderNotifications: e.target.checked})}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
            
            {/* Save Button for Notifications */}
            {hasUnsavedChanges && (
              <div className="mt-8 pt-6 border-t border-gray-200 hidden md:block">
                <div className="flex justify-between items-center">
                  {message && (
                    <div className={`text-sm ${message.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
                      {message}
                    </div>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="ml-auto bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save Notifications'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
          </div>
        </div>
      </div>
      {/* Global mobile sticky save bar */}
      {hasUnsavedChanges && (
        <div className="md:hidden fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] inset-x-0 px-4 z-40">
          <div className="bg-white border border-gray-200 shadow-lg rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="flex-1 text-xs text-gray-600">
              {message ? (
                <span className={`${message.includes('success') ? 'text-green-600' : 'text-red-600'}`}>{message}</span>
              ) : (
                'Unsaved changes'
              )}
            </div>
            <button
              type="button"
              onClick={() => { if (originalSettings) { setSettings({ ...originalSettings }); setHasUnsavedChanges(false); } }}
              className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1 rounded-md"
            >
              Discard
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="inline-flex items-center gap-1 bg-blue-600 text-white text-xs font-semibold px-3 py-2 rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
            >
              {saving && (
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><circle cx="12" cy="12" r="10" className="opacity-25" /><path className="opacity-75" d="M4 12a8 8 0 018-8V2C5.58 2 2 5.58 2 10h2zm2 5.29A7.96 7.96 0 014 12H2c0 3.04 1.14 5.82 3 7.94l1-2.65z" fill="currentColor" /></svg>
              )}
              {saving ? 'Saving' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="modal-overlay">
          <div className="modal animate-scale-in">
            <div className="modal-header">
              <h3 className="text-lg font-semibold text-gray-900">Unsaved Changes</h3>
            </div>
            <div className="modal-body">
              <p className="text-gray-600">
                You have unsaved changes. Do you want to save them before switching tabs?
              </p>
            </div>
            <div className="modal-footer">
              <button
                onClick={cancelNavigation}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={confirmNavigateWithoutSaving}
                className="btn-danger"
              >
                Don't Save
              </button>
              <button
                onClick={async () => {
                  await handleSave();
                  if (pendingTab) {
                    setActiveTab(pendingTab as any);
                    setPendingTab(null);
                  }
                  setShowConfirmDialog(false);
                }}
                className="btn-primary"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserSettings;