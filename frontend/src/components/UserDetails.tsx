import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminAPI } from '../services/api';
import { DetailedUser, TimeEntry } from '../types';
import TextField from './ui/TextField';
import EditPaySettingsModal from './EditPaySettingsModal';
import { useAuth } from '../contexts/AuthContext';

interface ContactDraft {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  mobilePhone: string;
}

const UserDetails: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [user, setUser] = useState<DetailedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [contactDraft, setContactDraft] = useState<ContactDraft | null>(null);
  const [contactEditMode, setContactEditMode] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [tokenMessage, setTokenMessage] = useState<string | null>(null);
  const messageRef = useRef<HTMLDivElement | null>(null);
  const originalContact = useRef<ContactDraft | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPayModal, setShowPayModal] = useState(false);
  const [paySavingKey, setPaySavingKey] = useState(0); // trigger refresh when pay saved
  // Time data state
  const [timeStatus, setTimeStatus] = useState<{ status: 'clocked-in' | 'clocked-out'; activeEntry: { id: number; clockIn: string } | null } | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [pendingManual, setPendingManual] = useState<TimeEntry[]>([]);
  const [entriesPage, setEntriesPage] = useState(1);
  const [entriesTotal, setEntriesTotal] = useState(0);
  const [entriesPageSize, setEntriesPageSize] = useState(25);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [entriesFilter, setEntriesFilter] = useState<{ approval: string; manual: string }>({ approval: 'all', manual: 'all' });
  const [statusLoading, setStatusLoading] = useState(false);
  const [durationTick, setDurationTick] = useState(0); // forces re-render for live duration

  // Guard: only admins/supers
  useEffect(() => {
    if (!currentUser?.isAdmin && !currentUser?.isSuperUser) {
      navigate('/', { replace: true });
    }
  }, [currentUser, navigate]);

  useEffect(() => {
    const fetchUser = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const res = await adminAPI.getFullUser(Number(id));
        const u = res.data.user as DetailedUser;
        // Normalize potentially string numeric fields arriving from the API (PG numeric)
        const normalized: DetailedUser = {
          ...u,
          hourlyRate: u.hourlyRate !== undefined && u.hourlyRate !== null ? Number(u.hourlyRate) : 0,
          taxRate: u.taxRate !== undefined && u.taxRate !== null ? Number(u.taxRate) : u.taxRate,
        };
        setUser(normalized);
        const draft = {
          addressLine1: normalized.addressLine1 || '',
            addressLine2: normalized.addressLine2 || '',
            city: normalized.city || '',
            state: normalized.state || '',
            postalCode: normalized.postalCode || '',
            country: normalized.country || '',
            phone: normalized.phone || '',
            mobilePhone: normalized.mobilePhone || ''
        };
        setContactDraft(draft);
        originalContact.current = draft;
      } catch (e: any) {
        setError(e.response?.data?.error || 'Failed to load user');
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [id, paySavingKey]);

  // Fetch time status
  const fetchTimeStatus = useCallback(async () => {
    if (!id) return;
    setStatusLoading(true);
    try {
      const res = await adminAPI.getUserTimeStatus(Number(id));
      setTimeStatus(res.data);
    } catch (e: any) {
      setEntriesError(e.response?.data?.error || 'Failed to load time status');
    } finally {
      setStatusLoading(false);
    }
  }, [id]);

  // Fetch time entries
  const fetchTimeEntries = useCallback(async () => {
    if (!id) return;
    setEntriesLoading(true);
    setEntriesError(null);
    try {
      const res = await adminAPI.getUserTimeEntries(Number(id), {
        page: entriesPage,
        pageSize: entriesPageSize,
        approval: entriesFilter.approval,
        manual: entriesFilter.manual,
      });
      const data = res.data;
      const list: TimeEntry[] = data.entries || data || [];
      setEntries(list);
      setEntriesTotal(data.total || list.length);
      // pending manual entries (subset) derive separately for convenience
      setPendingManual(list.filter(e => e.isManual && e.approvalStatus === 'pending'));
    } catch (e: any) {
      setEntriesError(e.response?.data?.error || 'Failed to load time entries');
    } finally {
      setEntriesLoading(false);
    }
  }, [id, entriesPage, entriesPageSize, entriesFilter]);

  // Initial load of time data when user loaded
  useEffect(() => {
    if (!user) return;
    fetchTimeStatus();
    fetchTimeEntries();
  }, [user, fetchTimeStatus, fetchTimeEntries]);

  // Poll active status every 60s when clocked in
  useEffect(() => {
    if (!timeStatus || timeStatus.status !== 'clocked-in') return;
    const interval = setInterval(() => {
      fetchTimeStatus();
    }, 60000);
    return () => clearInterval(interval);
  }, [timeStatus, fetchTimeStatus]);

  // Live duration (computed) recalculated on durationTick
  const activeDuration = (() => {
    if (!timeStatus || timeStatus.status !== 'clocked-in' || !timeStatus.activeEntry) return null;
    const raw = timeStatus.activeEntry.clockIn;
    // Robust parse: if string already includes timezone (Z or +/-), parse directly.
    // If naive (no timezone), treat as local time, not UTC. Avoid appending Z unless difference is absurd.
    let start: Date;
    if (/Z|[+-]\d{2}:?\d{2}$/.test(raw)) {
      start = new Date(raw);
    } else {
      // Normalize space separator to 'T' for consistent parsing
      const normalized = raw.replace(' ', 'T');
      start = new Date(normalized);
    }
    let ms = Date.now() - start.getTime();
    // If still wildly negative (>5m future), clamp to 0 (guards server clock skew / mis-parse)
    if (ms < -300000) ms = 0;
    if (ms < 0) ms = 0; // small negative clamp
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  })();

  // Interval updates durationTick every second while clocked in
  useEffect(() => {
    if (timeStatus?.status !== 'clocked-in') return;
    const interval = setInterval(() => setDurationTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [timeStatus?.status]);

  const updateField = (field: keyof ContactDraft, value: string) => {
    setContactDraft(d => d ? { ...d, [field]: value } : d);
    // Clear field-specific error on change
    setFieldErrors(errs => ({ ...errs, [field]: '' }));
  };

  const handleSaveContact = async () => {
    if (!user || !contactDraft) return;
    if (JSON.stringify(contactDraft) === JSON.stringify(originalContact.current)) { setContactEditMode(false); return; } // no changes
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const res = await adminAPI.updateUserContact(user.id, contactDraft);
      const { contact } = res.data;
      setUser(prev => prev ? { ...prev, ...contact } : prev);
      originalContact.current = { ...contactDraft };
      setSaveMessage('Contact details saved');
      setContactEditMode(false);
      setTimeout(() => setSaveMessage(null), 4000);
      requestAnimationFrame(() => messageRef.current?.focus());
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to save contact');
      requestAnimationFrame(() => messageRef.current?.focus());
    } finally {
      setSaving(false);
    }
  };

  // Simple phone formatting (digits only) on blur
  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    }
    return value; // leave as-is if not 10 digits
  };

  const onBlurFormat = (field: keyof ContactDraft) => {
    setContactDraft(d => {
      if (!d) return d;
      const formatted = formatPhone(d[field]);
      const next = { ...d, [field]: formatted };
      // Validation on blur for phone/mobile
      if ((field === 'phone' || field === 'mobilePhone') && d[field].trim()) {
        const digits = d[field].replace(/\D/g, '');
        if (digits.length !== 10) {
          setFieldErrors(errs => ({ ...errs, [field]: 'Enter 10-digit number' }));
        }
      }
      return next;
    });
  };

  // Postal code quick validation (US-like length 3-10 for generic) on blur via effect watching changes
  useEffect(() => {
    if (!contactDraft) return;
    const { postalCode } = contactDraft;
    if (postalCode && (postalCode.length < 3 || postalCode.length > 10)) {
      setFieldErrors(errs => ({ ...errs, postalCode: 'Postal length 3-10' }));
    } else {
      setFieldErrors(errs => ({ ...errs, postalCode: '' }));
    }
  }, [contactDraft]);

  // Unsaved changes warning on window unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (contactDraft && originalContact.current && JSON.stringify(contactDraft) !== JSON.stringify(originalContact.current)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [contactDraft]);

  const regenerateToken = async () => {
    if (!user || user.isProvisioned) return;
    setRegenerating(true);
    setTokenMessage(null);
    try {
      const res = await adminAPI.regenerateProvisionToken(user.id);
      const exp = res.data.provisionTokenExpires;
      setUser(prev => prev ? { ...prev, provisionTokenExpires: exp } : prev);
      setTokenMessage('Provision token regenerated');
      setTimeout(() => setTokenMessage(null), 5000);
      requestAnimationFrame(() => messageRef.current?.focus());
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to regenerate token');
      requestAnimationFrame(() => messageRef.current?.focus());
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading user…</div>;
  }
  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }
  if (!user || !contactDraft) return null;

  const manualPct = user.stats.totalEntries > 0 ? ((user.stats.manualEntries / user.stats.totalEntries) * 100).toFixed(1) : '0.0';

  const riskBadge = (() => {
    const ratio = user.stats.totalEntries > 0 ? user.stats.manualEntries / user.stats.totalEntries : 0;
    if (ratio > 0.15 && user.stats.totalEntries >= 5) return { label: 'High Manual Risk', className: 'bg-rose-100 text-rose-700' };
    if (ratio > 0.05 && user.stats.totalEntries >= 5) return { label: 'Medium Manual Risk', className: 'bg-amber-100 text-amber-700' };
    return { label: 'Low Manual Risk', className: 'bg-emerald-100 text-emerald-700' };
  })();

  const canDelete = currentUser?.isSuperUser && currentUser.id !== user.id; // prevent self delete

  const formattedHourly = typeof user.hourlyRate === 'number' && !isNaN(user.hourlyRate)
    ? user.hourlyRate.toFixed(2)
    : Number(user.hourlyRate || 0).toFixed(2);

  const performDelete = async () => {
    if (!canDelete || !user) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await adminAPI.deleteUser(user.id);
      navigate('/admin', { replace: true });
    } catch (e: any) {
      setDeleteError(e.response?.data?.error || 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <div>
        <button onClick={() => navigate(-1)} className="text-sm text-blue-600 hover:text-blue-700">← Back</button>
        {/* Summary Card */}
        <div className="mt-3 bg-white border border-gray-200 rounded-lg p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              {user.firstName} {user.lastName}
              {user.isSuperUser ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">Super User</span>
              ) : user.isAdmin ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Admin</span>
              ) : user.isProvisioned ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">Employee</span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">Pending</span>
              )}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium ${user.isProvisioned ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{user.isProvisioned ? 'Provisioned' : 'Not Provisioned'}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium ${riskBadge.className}`}>{riskBadge.label}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded font-medium bg-slate-100 text-slate-700">Manual {manualPct}%</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded font-medium bg-slate-50 text-slate-600">ID #{user.id}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded font-medium bg-slate-50 text-slate-600">Created {new Date(user.createdAt).toLocaleDateString()}</span>
              {user.provisionTokenExpires && !user.isProvisioned && (
                <span className="inline-flex items-center px-2 py-0.5 rounded font-medium bg-indigo-50 text-indigo-700">Expires {new Date(user.provisionTokenExpires).toLocaleDateString()}</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(user.email); setTokenMessage('Email copied'); setTimeout(()=> setTokenMessage(null), 2000); requestAnimationFrame(()=> messageRef.current?.focus()); }}
              className="px-3 py-1.5 rounded-md text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
            >Copy Email</button>
            {!user.isProvisioned && (currentUser?.isAdmin || currentUser?.isSuperUser) && (
              <button
                type="button"
                disabled={regenerating}
                onClick={regenerateToken}
                className={`px-3 py-1.5 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 ${regenerating ? 'bg-amber-200 text-amber-700 cursor-wait' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
              >{regenerating ? 'Regenerating…' : 'Regenerate Token'}</button>
            )}
          </div>
        </div>
      </div>

      {/* Live feedback region */}
      <div
        aria-live="polite"
        role="status"
        ref={messageRef}
        tabIndex={-1}
        className="outline-none"
      >
        {(error || saveMessage || tokenMessage) && (
          <div className="rounded-md border p-3 text-sm flex items-start gap-2 mt-2 w-full max-w-md"
            style={{ background: error ? '#fef2f2' : '#f0fdf4', borderColor: error ? '#fecaca' : '#bbf7d0', color: error ? '#b91c1c' : '#166534' }}>
            <span className="font-medium">{error ? 'Error:' : 'Info:'}</span>
            <span>{error || saveMessage || tokenMessage}</span>
          </div>
        )}
      </div>

      {/* Account Overview (replaces Identity & Role) */}
      <section className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Account Overview</h2>
            <p className="text-xs text-gray-500 mt-1">Core identity, access level, and provisioning metadata.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px]">
            {user.isSuperUser && <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">Super User</span>}
            {!user.isSuperUser && user.isAdmin && <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">Admin</span>}
            {!user.isAdmin && !user.isSuperUser && user.isProvisioned && <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">Employee</span>}
            {!user.isProvisioned && <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Pending</span>}
            <span className={`px-2 py-0.5 rounded font-medium ${riskBadge.className}`}>{riskBadge.label}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {/* Account */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Account</h3>
            <dl className="text-sm space-y-1">
              <div className="flex items-center justify-between gap-4"><dt className="text-gray-500">User ID</dt><dd className="font-mono text-gray-900">#{user.id}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-gray-500">Email</dt><dd className="truncate max-w-[140px]" title={user.email}>{user.email}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-gray-500">Created</dt><dd>{new Date(user.createdAt).toLocaleDateString()}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-gray-500">Account Age</dt><dd>{Math.max(1, Math.round((Date.now()-new Date(user.createdAt).getTime())/86400000))}d</dd></div>
            </dl>
          </div>
          {/* Access */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Access</h3>
            <dl className="text-sm space-y-1">
              <div className="flex items-center justify-between gap-4"><dt className="text-gray-500">Role</dt><dd>{user.isSuperUser ? 'Super' : user.isAdmin ? 'Admin' : user.isProvisioned ? 'Employee' : 'Pending'}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-gray-500">Provisioned</dt><dd>{user.isProvisioned ? 'Yes' : 'No'}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-gray-500">Overtime Enabled</dt><dd>{user.overtimeEnabled ? 'Yes' : 'No'}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-gray-500">Timezone</dt><dd>{user.timezone || '—'}</dd></div>
            </dl>
          </div>
          {/* Activity */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Activity</h3>
            <dl className="text-sm space-y-1">
              <div className="flex items-center justify-between gap-4"><dt className="text-gray-500">Entries</dt><dd>{user.stats.totalEntries}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-gray-500">Manual %</dt><dd>{manualPct}%</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-gray-500">Manual Count</dt><dd>{user.stats.manualEntries}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-gray-500">Risk Level</dt><dd>{riskBadge.label.replace(' Manual Risk','')}</dd></div>
            </dl>
          </div>
          {/* Provisioning */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Provisioning</h3>
            <dl className="text-sm space-y-1">
              <div className="flex items-center justify-between gap-4"><dt className="text-gray-500">Status</dt><dd>{user.isProvisioned ? 'Active' : 'Pending'}</dd></div>
              {!user.isProvisioned && user.provisionTokenExpires && (
                <div className="flex items-center justify-between gap-4"><dt className="text-gray-500">Token Expires</dt><dd>{new Date(user.provisionTokenExpires).toLocaleDateString()}</dd></div>
              )}
              <div className="flex items-center justify-between gap-4"><dt className="text-gray-500">Pay Schedule</dt><dd>{user.paySchedule || '—'}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-gray-500">Tax Rate</dt><dd>{user.taxRate ?? 25}%</dd></div>
            </dl>
          </div>
        </div>
      </section>

      {/* Time & Attendance Overview */}
      <section className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Time & Attendance</h2>
            <p className="text-xs text-gray-500 mt-1">Live status, pending manual requests, and recent time entries.</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => { fetchTimeStatus(); fetchTimeEntries(); }}
              className="px-2 py-1.5 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
            >Refresh</button>
          </div>
        </div>
        {/* Current Status */}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Status:</span>
            {statusLoading ? (
              <span className="text-gray-400">Loading…</span>
            ) : timeStatus?.status === 'clocked-in' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-100 text-green-700 font-medium">Clocked In
                <span className="font-mono text-xs">{activeDuration}</span>
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">Clocked Out</span>
            )}
          </div>
          {timeStatus?.activeEntry && (
            <div className="text-xs text-gray-500">Since {new Date(timeStatus.activeEntry.clockIn).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</div>
          )}
        </div>
        {/* Pending Manual Requests */}
        <div>
          <h3 className="text-xs font-semibold tracking-wide uppercase text-gray-500 mb-2">Pending Manual Requests</h3>
            {entriesLoading && entriesPage === 1 ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : pendingManual.length === 0 ? (
              <div className="text-sm text-gray-500 italic">None pending.</div>
            ) : (
              <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md overflow-hidden bg-white">
                {pendingManual.slice(0,5).map(e => {
                  const ci = new Date(e.clockIn);
                  const co = e.clockOut ? new Date(e.clockOut) : null;
                  const duration = co ? (()=>{ const ms = co.getTime() - ci.getTime(); const h=Math.floor(ms/3600000); const m=Math.floor((ms%3600000)/60000); return `${h}h ${m}m`; })() : '—';
                  return (
                    <li key={e.id} className="p-3 text-xs flex items-center justify-between gap-3">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-medium text-gray-900 truncate">{ci.toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span>
                        <span className="text-gray-500">{ci.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',hour12:false})} - {co ? co.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',hour12:false}) : '—'}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-gray-800">{duration}</span>
                        {/* workDescription removed */}
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-medium">Pending</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
        </div>
        {/* Recent Time Entries */}
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-xs font-semibold tracking-wide uppercase text-gray-500">Recent Time Entries</h3>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <label className="flex items-center gap-1">
                <span className="text-gray-600">Approval</span>
                <select value={entriesFilter.approval} onChange={e => { setEntriesPage(1); setEntriesFilter(f => ({ ...f, approval: e.target.value })); }} className="border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="denied">Denied</option>
                </select>
              </label>
              <label className="flex items-center gap-1">
                <span className="text-gray-600">Manual</span>
                <select value={entriesFilter.manual} onChange={e => { setEntriesPage(1); setEntriesFilter(f => ({ ...f, manual: e.target.value })); }} className="border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                  <option value="all">All</option>
                  <option value="true">Manual Only</option>
                  <option value="false">Automatic Only</option>
                </select>
              </label>
              <label className="flex items-center gap-1">
                <span className="text-gray-600">Page Size</span>
                <select value={entriesPageSize} onChange={e => { setEntriesPageSize(Number(e.target.value)); setEntriesPage(1); }} className="border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                  {[10,25,50,100].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
          </div>
          {entriesError && <div className="text-sm text-red-600">{entriesError}</div>}
          {entriesLoading && entries.length === 0 ? (
            <div className="text-sm text-gray-500">Loading entries…</div>
          ) : entries.length === 0 ? (
            <div className="text-sm text-gray-500 italic">No entries found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Clock In</th>
                    <th className="py-2 pr-4 font-medium">Clock Out</th>
                    <th className="py-2 pr-4 font-medium">Duration</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Approval</th>
                    {/* Description column removed */}
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => {
                    const ci = new Date(e.clockIn);
                    const co = e.clockOut ? new Date(e.clockOut) : null;
                    const duration = co ? (()=>{ const ms = co.getTime() - ci.getTime(); const h=Math.floor(ms/3600000); const m=Math.floor((ms%3600000)/60000); return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`; })() : (e.approvalStatus === 'pending' ? '—' : 'In');
                    return (
                      <tr key={e.id} className="border-t first:border-t-0 border-gray-200 hover:bg-gray-50 align-top">
                        <td className="py-2 pr-4 whitespace-nowrap text-gray-700">{ci.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</td>
                        <td className="py-2 pr-4 font-mono text-gray-800">{ci.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',hour12:false})}</td>
                        <td className="py-2 pr-4 font-mono text-gray-800">{co ? co.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',hour12:false}) : <span className="text-green-600 font-medium">{timeStatus?.activeEntry?.id === e.id ? 'Active' : '—'}</span>}</td>
                        <td className="py-2 pr-4 font-mono text-gray-800">{duration}</td>
                        <td className="py-2 pr-4 text-gray-700">{e.isManual ? <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-[11px]">Manual</span> : <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[11px]">Automatic</span>}</td>
                        <td className="py-2 pr-4 text-gray-700">
                          {e.approvalStatus === 'approved' && <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-[11px]">Approved</span>}
                          {e.approvalStatus === 'pending' && <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-[11px]">Pending</span>}
                          {e.approvalStatus === 'denied' && <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-700 text-[11px]">Denied</span>}
                        </td>
                        {/* Description cell removed */}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* Pagination */}
          {entriesTotal > entriesPageSize && (
            <div className="flex items-center justify-between text-xs text-gray-600 flex-wrap gap-3">
              <div>Page {entriesPage} of {Math.ceil(entriesTotal / entriesPageSize)} (Total {entriesTotal})</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={entriesPage === 1 || entriesLoading}
                  onClick={() => { if (entriesPage > 1) { setEntriesPage(p => p - 1); }}}
                  className={`px-2 py-1 rounded-md border text-[11px] ${entriesPage === 1 || entriesLoading ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                >Prev</button>
                <button
                  type="button"
                  disabled={entriesPage >= Math.ceil(entriesTotal / entriesPageSize) || entriesLoading}
                  onClick={() => { if (entriesPage < Math.ceil(entriesTotal / entriesPageSize)) { setEntriesPage(p => p + 1); }}}
                  className={`px-2 py-1 rounded-md border text-[11px] ${entriesPage >= Math.ceil(entriesTotal / entriesPageSize) || entriesLoading ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                >Next</button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Contact */}
      <section className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Contact Information</h2>
          <div className="flex items-center gap-2">
            {!contactEditMode && (
              <button
                type="button"
                onClick={() => setContactEditMode(true)}
                className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
              >Edit</button>
            )}
            {contactEditMode && (
              <>
                <button
                  type="button"
                  onClick={handleSaveContact}
                  disabled={saving || !contactDraft || !originalContact.current || JSON.stringify(contactDraft) === JSON.stringify(originalContact.current) || Object.values(fieldErrors).some(v => v)}
                  className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${saving ? 'bg-blue-300 text-white cursor-wait' : Object.values(fieldErrors).some(v => v) ? 'bg-red-200 text-red-700 cursor-not-allowed' : (contactDraft && originalContact.current && JSON.stringify(contactDraft) !== JSON.stringify(originalContact.current)) ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
                >{saving ? 'Saving…' : Object.values(fieldErrors).some(v => v) ? 'Fix Errors' : 'Save'}</button>
                <button
                  type="button"
                  onClick={() => { if (!saving) { setContactDraft(originalContact.current); setContactEditMode(false); setFieldErrors({}); } }}
                  className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
                >Cancel</button>
              </>
            )}
          </div>
        </div>
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${!contactEditMode ? 'opacity-60 pointer-events-none select-none' : ''}`}>
          <TextField disabled={!contactEditMode} label="Address Line 1" value={contactDraft.addressLine1} onChange={e => updateField('addressLine1', e.target.value)} placeholder="123 Main St" />
          <TextField disabled={!contactEditMode} label="Address Line 2" value={contactDraft.addressLine2} onChange={e => updateField('addressLine2', e.target.value)} placeholder="Apt / Suite" />
          <TextField disabled={!contactEditMode} label="City" value={contactDraft.city} onChange={e => updateField('city', e.target.value)} />
          <TextField disabled={!contactEditMode} label="State / Region" value={contactDraft.state} onChange={e => updateField('state', e.target.value)} />
          <TextField disabled={!contactEditMode} label="Postal Code" value={contactDraft.postalCode} onChange={e => updateField('postalCode', e.target.value)} error={fieldErrors.postalCode} />
          <TextField disabled={!contactEditMode} label="Country" value={contactDraft.country} onChange={e => updateField('country', e.target.value)} />
          <TextField disabled={!contactEditMode} label="Phone" value={contactDraft.phone} onChange={e => updateField('phone', e.target.value)} onBlur={() => onBlurFormat('phone')} error={fieldErrors.phone} placeholder="(555) 123-4567" />
          <TextField disabled={!contactEditMode} label="Mobile" value={contactDraft.mobilePhone} onChange={e => updateField('mobilePhone', e.target.value)} onBlur={() => onBlurFormat('mobilePhone')} error={fieldErrors.mobilePhone} placeholder="(555) 987-6543" />
        </div>
        {!contactEditMode && <p className="text-[11px] text-gray-500">Fields are read-only. Click Edit to modify contact details.</p>}
        {contactEditMode && <p className="text-[11px] text-gray-500">Save or cancel your changes. Unsaved edits will be lost if you cancel.</p>}
      </section>

      {/* Pay Summary with Edit */}
      <section className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">Pay Settings</h2>
          {(currentUser?.isAdmin || currentUser?.isSuperUser) && (
            <button
              type="button"
              onClick={() => setShowPayModal(true)}
              className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >Edit Pay</button>
          )}
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4 text-sm">
          <div className="space-y-0.5">
            <dt className="text-gray-500">Hourly Rate</dt>
            <dd className="font-mono text-gray-900">${formattedHourly}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-gray-500">Tax Rate</dt>
            <dd className="text-gray-900">{user.taxRate ?? 25}%</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-gray-500">Schedule</dt>
            <dd className="text-gray-900">{user.paySchedule || '—'}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-gray-500">Overtime</dt>
            <dd className="text-gray-900">{user.overtimeEnabled ? 'Enabled' : 'Disabled'}</dd>
          </div>
        </dl>
        <p className="text-[11px] text-gray-500">Adjust pay settings for this user. Changes take effect immediately.</p>
      </section>

      {showPayModal && (
        <EditPaySettingsModal
          isOpen={showPayModal}
          onClose={() => setShowPayModal(false)}
          onSuccess={() => { setPaySavingKey(k => k + 1); setTokenMessage('Pay settings updated'); setTimeout(()=> setTokenMessage(null), 3000); requestAnimationFrame(()=> messageRef.current?.focus()); }}
          employee={user as any}
        />
      )}

      {canDelete && (
        <section className="bg-white border border-red-300 rounded-lg p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-red-700">Danger Zone</h2>
            {!showDelete && (
              <button
                onClick={() => setShowDelete(true)}
                className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >Delete User…</button>
            )}
          </div>
          {showDelete && (
            <div className="space-y-3">
              <p className="text-sm text-red-700">This will permanently remove the user and all associated time entries. This action cannot be undone.</p>
              <label className="block text-sm space-y-1">
                <span className="text-gray-600">Type the user's email (<span className="font-mono">{user.email}</span>) to confirm</span>
                <input
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  className="w-full rounded-md border-gray-300 focus:ring-red-500 focus:border-red-500 text-sm"
                  placeholder={user.email}
                />
              </label>
              {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
              <div className="flex items-center gap-3">
                <button
                  disabled={deleting || deleteConfirmText !== user.email}
                  onClick={performDelete}
                  className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 ${deleteConfirmText === user.email && !deleting ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-red-300 text-white cursor-not-allowed'}`}
                >{deleting ? 'Deleting…' : 'Confirm Delete'}</button>
                <button
                  type="button"
                  onClick={() => { if (!deleting) { setShowDelete(false); setDeleteConfirmText(''); setDeleteError(null);} }}
                  className="text-sm text-gray-600 hover:text-gray-800"
                >Cancel</button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default UserDetails;
