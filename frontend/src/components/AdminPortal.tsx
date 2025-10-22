/**
 * AdminPortal Component
 * ---------------------
 * Responsibilities:
 *   - Provides a1 accessible tabbed interface for three admin domains: approvals, users, payroll.
 *   - Fetches data lazily per tab to keep initial payload small (users/payroll on demand).
 *   - Handles manual time entry approval workflow with optional notes (optimistic removal).
 *
 * Accessibility:
 *   - Implements WAI-ARIA tablist roles with keyboard navigation (Arrow/Home/End).
 *   - Table + mobile card dual rendering for responsive design; hidden via CSS + display conditions.
 *   - Buttons include aria-label context where text alone may be ambiguous.
 *
 * State Partitioning:
 *   - Separate loading flags (loadingApprovals, loadingUsers, loadingStats) to avoid UI jank.
 *   - notesDraft & expandedNotes keyed by entry id to isolate uncontrolled inputs.
 *   - actionProcessing gates concurrent approve/deny actions to prevent duplicate submissions.
 *
 * Performance Considerations:
 *   - Approvals panel may grow—eventually paginate or window large lists.
 *   - Stats refreshed only when needed (after action) to avoid periodic polling.
 *
 * Future Enhancements:
 *   - Add toast / live region announcements for success & error feedback.
 *   - Extract reusable data hooks (useAdminStats, usePendingEntries) once complexity increases.
 *   - Implement Users & Payroll panels (current placeholders) with shared responsive table/card pattern.
 *   - Add filtering & search for approvals.
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { debugInfo } from '../utils/debug';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../services/api';
import { TimeEntry, User, PayrollPeriodUser } from '../types';
import CreateUserModal from './CreateUserModal';

interface TabDef { id: 'approvals' | 'users' | 'payroll'; label: string; }
const TABS: TabDef[] = [
  { id: 'approvals', label: 'Time Approvals' },
  { id: 'users', label: 'User Management' },
  { id: 'payroll', label: 'Pay Management' }
];

// Constant for 48h in ms (hoisted to avoid missing dependency warnings)
const H48 = 48 * 3600 * 1000;

// Accessible tab scaffolding with keyboard support & lazy data loading
const AdminPortal: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabDef['id']>('approvals');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Data layer (step 5)
  const [pendingEntries, setPendingEntries] = useState<TimeEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState({ pendingEntries: 0, totalManualThisMonth: 0, approvedThisWeek: 0, deniedThisWeek: 0 });
  const [loadingApprovals, setLoadingApprovals] = useState<boolean>(false);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [loadingStats, setLoadingStats] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actionProcessing, setActionProcessing] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});
  const [expandedNotes, setExpandedNotes] = useState<Record<number, boolean>>({});
  const [userActionProcessing, setUserActionProcessing] = useState<number | null>(null);
  const [payFilter, setPayFilter] = useState<string>('all');
  const [payAdvancedFilter, setPayAdvancedFilter] = useState<{ schedule: string; overtime: string; hours: string }>({ schedule: 'all', overtime: 'all', hours: 'all' });
  const [userFilter, setUserFilter] = useState<string>('all'); // users panel filter (risk & provisioning)
  const [userSearch, setUserSearch] = useState<string>('');
  const [userSort, setUserSort] = useState<{ field: 'name' | 'email' | 'provision' | 'entries' | 'manualPct' | 'created'; dir: 'asc' | 'desc' }>({ field: 'name', dir: 'asc' });
  const [periodHours, setPeriodHours] = useState<Record<number, PayrollPeriodUser>>({});
  const [loadingPeriodHours, setLoadingPeriodHours] = useState<boolean>(false);
  // Payroll sorting
  const [paySort, setPaySort] = useState<{ field: 'name' | 'hours' | 'rate' | 'gross'; dir: 'asc' | 'desc' }>({ field: 'name', dir: 'asc' });
  // Density toggle removed; using fixed comfortable spacing (py-3 rows, p-4 cards)
  const navigate = useNavigate();

  // Derived payroll aggregates
  const payUsers = users.filter(u => u.isProvisioned); // focus on provisioned employees
  const numericRate = (r: any) => (typeof r === 'number' ? r : Number(r) || 0);
  const payUsersSorted = [...payUsers].sort((a, b) => numericRate(a.hourlyRate) - numericRate(b.hourlyRate));
  const filteredPayUsers = payUsers.filter(u => {
    // Primary simple filter (rate/overtime/missing rate/band)
    if (payFilter === 'overtime' && !u.overtimeEnabled) return false;
    if (payFilter === 'no-rate' && numericRate(u.hourlyRate)) return false;
    if (payFilter.startsWith('band:')) {
      const [, band] = payFilter.split(':');
      const rate = numericRate(u.hourlyRate);
      const [minStr, maxStr] = band.split('-');
      const min = Number(minStr);
      const max = Number(maxStr);
      if (!(rate >= min && rate < max)) return false;
    }
    // Advanced filters
    const ph = periodHours[u.id];
    if (payAdvancedFilter.schedule !== 'all') {
      if ((u.paySchedule || 'unspecified') !== payAdvancedFilter.schedule) return false;
    }
    if (payAdvancedFilter.overtime !== 'all') {
      const expects = payAdvancedFilter.overtime === 'yes';
      if (!!u.overtimeEnabled !== expects) return false;
    }
    if (payAdvancedFilter.hours !== 'all' && ph) {
      if (payAdvancedFilter.hours === 'gt0' && !(ph.hours > 0)) return false;
      if (payAdvancedFilter.hours === 'eq0' && !(ph.hours === 0)) return false;
      if (payAdvancedFilter.hours === 'ot' && !(ph.overtimeHours > 0)) return false;
    }
    return true;
  });

  // Median hourly rate (more robust than mean for outliers)
  const medianRate = (() => {
    if (!payUsersSorted.length) return 0;
    const mid = Math.floor(payUsersSorted.length / 2);
    if (payUsersSorted.length % 2 === 0) {
      return (numericRate(payUsersSorted[mid - 1].hourlyRate) + numericRate(payUsersSorted[mid].hourlyRate)) / 2;
    }
    return numericRate(payUsersSorted[mid].hourlyRate);
  })();

  // Estimated weekly baseline payroll (40h * rate for each provisioned user)
  const weeklyBaseline = payUsers.reduce((sum, u) => sum + numericRate(u.hourlyRate) * 40, 0);


  // Active payroll filter chips (for consolidated toolbar)
  const activePayFilterChips = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    if (payFilter !== 'all') {
      if (payFilter === 'overtime') chips.push({ key: 'pf:overtime', label: 'Overtime Enabled' });
      else if (payFilter === 'no-rate') chips.push({ key: 'pf:no-rate', label: 'Missing Rate' });
    }
    if (payAdvancedFilter.schedule !== 'all') chips.push({ key: 'af:schedule', label: `Schedule ${payAdvancedFilter.schedule}` });
    if (payAdvancedFilter.overtime !== 'all') chips.push({ key: 'af:overtime', label: payAdvancedFilter.overtime === 'yes' ? 'Overtime Yes' : 'Overtime No' });
    if (payAdvancedFilter.hours !== 'all') {
      const map: Record<string, string> = { gt0: '>0h', eq0: '=0h', ot: 'Has OT' };
      chips.push({ key: 'af:hours', label: `Hours ${map[payAdvancedFilter.hours] || payAdvancedFilter.hours}` });
    }
    return chips;
  }, [payFilter, payAdvancedFilter]);

  const clearPayFilterChip = (key: string) => {
    if (key.startsWith('pf:')) {
      setPayFilter('all');
    } else if (key === 'af:schedule') {
      setPayAdvancedFilter(f => ({ ...f, schedule: 'all' }));
    } else if (key === 'af:overtime') {
      setPayAdvancedFilter(f => ({ ...f, overtime: 'all' }));
    } else if (key === 'af:hours') {
      setPayAdvancedFilter(f => ({ ...f, hours: 'all' }));
    }
  };

  const clearAllPayFilters = () => {
    setPayFilter('all');
    setPayAdvancedFilter({ schedule: 'all', overtime: 'all', hours: 'all' });
  };

  const overtimeEnabledCount = payUsers.filter(u => u.overtimeEnabled).length;
  const scheduleCounts = payUsers.reduce<Record<string, number>>((acc, u) => {
    const key = u.paySchedule || 'unspecified';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  // ---------------- Users Panel Derived Metrics ----------------
  const provisioningMetrics = useMemo(() => {
    const now = Date.now();
    let pending = 0, expiring = 0, expired = 0, provisioned = 0;
    let highRisk = 0, mediumRisk = 0, lowRisk = 0;
    users.forEach(u => {
      if (u.isProvisioned) provisioned++; else {
        const exp = u.provisionTokenExpires ? new Date(u.provisionTokenExpires).getTime() : null;
        if (exp && exp <= now) {
          expired++;
        } else {
          pending++;
          if (exp && (exp - now) <= H48) expiring++;
        }
      }
      const total = u.stats?.totalEntries || 0;
      const manual = u.stats?.manualEntries || 0;
      const ratio = total > 0 ? manual / total : 0;
      if (ratio > 0.15 && total >= 5) highRisk++; else if (ratio > 0.05 && total >= 5) mediumRisk++; else lowRisk++;
    });
    const denominator = provisioned + pending + expired || 1;
    const completionPct = Math.round((provisioned / denominator) * 100);
    return { pending, expiring, expired, provisioned, highRisk, mediumRisk, lowRisk, completionPct };
  }, [users]);

  const classifyRisk = (u: User) => {
    const total = u.stats?.totalEntries || 0;
    const manual = u.stats?.manualEntries || 0;
    const ratio = total > 0 ? manual / total : 0;
    if (ratio > 0.15 && total >= 5) return 'high';
    if (ratio > 0.05 && total >= 5) return 'medium';
    return 'low';
  };

  const riskBadgeMeta = (u: User) => {
    const risk = classifyRisk(u);
    switch (risk) {
      case 'high': return { label: 'High', color: 'bg-rose-100 text-rose-700' };
      case 'medium': return { label: 'Med', color: 'bg-amber-100 text-amber-700' };
      default: return { label: 'Low', color: 'bg-emerald-100 text-emerald-700' };
    }
  };

  const filteredUsers = useMemo(() => {
    const now = Date.now();
    const search = userSearch.trim().toLowerCase();
    const base = users.filter(u => {
      // Filter category
      let keep = true;
      if (userFilter !== 'all') {
  if (userFilter === 'prov') keep = !!u.isProvisioned;
  else if (userFilter === 'unprov') keep = !u.isProvisioned;
        else if (userFilter.startsWith('risk:')) keep = classifyRisk(u) === userFilter.split(':')[1];
        else if (userFilter === 'inv:expired') {
          if (u.isProvisioned) keep = false; else {
            const exp = u.provisionTokenExpires ? new Date(u.provisionTokenExpires).getTime() : 0;
            keep = exp > 0 && exp <= now;
          }
        } else if (userFilter === 'inv:expiring') {
          if (u.isProvisioned) keep = false; else {
            const exp = u.provisionTokenExpires ? new Date(u.provisionTokenExpires).getTime() : 0;
            keep = exp > now && (exp - now) <= H48;
          }
        }
      }
      if (!keep) return false;
      if (search) {
        const full = `${u.firstName||''} ${u.lastName||''}`.toLowerCase();
        const email = (u.email||'').toLowerCase();
        if (!full.includes(search) && !email.includes(search)) return false;
      }
      return true;
    });
    // Sorting
    return base.sort((a,b) => {
      const dir = userSort.dir === 'asc' ? 1 : -1;
      const totalA = a.stats?.totalEntries || 0; const totalB = b.stats?.totalEntries || 0;
      const manualA = a.stats?.manualEntries || 0; const manualB = b.stats?.manualEntries || 0;
      const ratioA = totalA>0 ? manualA/totalA : 0; const ratioB = totalB>0 ? manualB/totalB : 0;
      switch (userSort.field) {
        case 'name': {
          const an = `${a.firstName||''} ${a.lastName||''}`.toLowerCase();
          const bn = `${b.firstName||''} ${b.lastName||''}`.toLowerCase();
          return an < bn ? -1*dir : an > bn ? 1*dir : 0;
        }
        case 'email': {
          const ae = (a.email||'').toLowerCase();
            const be = (b.email||'').toLowerCase();
          return ae < be ? -1*dir : ae > be ? 1*dir : 0;
        }
        case 'provision': return (Number(a.isProvisioned)-Number(b.isProvisioned))*dir;
        case 'entries': return (totalA-totalB)*dir;
        case 'manualPct': return (ratioA-ratioB)*dir;
        case 'created': {
          const ac = new Date(a.createdAt).getTime();
          const bc = new Date(b.createdAt).getTime();
          return (ac-bc)*dir;
        }
        default: return 0;
      }
    });
  }, [users, userFilter, userSearch, userSort]);

  // User filter chips
  const activeUserFilterChips = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    if (userFilter !== 'all') {
      const map: Record<string,string> = {
        'prov':'Provisioned','unprov':'Unprovisioned','inv:expiring':'Invites <48h','inv:expired':'Expired Invites','risk:high':'High Manual Risk','risk:medium':'Medium Manual Risk'
      };
      chips.push({ key: 'uf', label: map[userFilter] || userFilter });
    }
    if (userSearch.trim()) chips.push({ key: 'search', label: `Search: ${userSearch.trim()}` });
    return chips;
  }, [userFilter, userSearch]);

  const clearUserChip = (key: string) => {
    if (key === 'uf') setUserFilter('all');
    if (key === 'search') setUserSearch('');
  };
  const clearAllUserFilters = () => { setUserFilter('all'); setUserSearch(''); };

  // Placeholder action handlers (to be replaced with real modals / flows)
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const handleCreateUser = () => {
    setCreateUserOpen(true);
  };
  const handleEditUser = (userId: number) => {
    if (userActionProcessing) return;
    navigate(`/admin/users/${userId}`);
  };
  const handlePaySettings = (userId: number) => {
    if (userActionProcessing) return;
    // Placeholder for future pay settings modal navigation
    debugInfo('Pay settings user', userId);
  };
  const handleRegenerateToken = async (userId: number) => {
    if (userActionProcessing) return;
    setUserActionProcessing(userId);
    try {
      await adminAPI.regenerateProvisionToken(userId);
      // Refresh users list to reflect new expiration
      fetchUsers();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to regenerate token');
    } finally {
      setUserActionProcessing(null);
    }
  };
  // Delete user action has been fully removed from list view; destructive action now
  // only available within the per-user details Danger Zone.

  const toggleExpandNotes = (id: number) => {
    setExpandedNotes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleApproveDeny = async (entryId: number, status: 'approved' | 'denied') => {
    if (actionProcessing) return; // prevent parallel
    const entry = pendingEntries.find(e => e.id === entryId);
    if (!entry) return;
    setActionProcessing(entryId);
    try {
      const notes = notesDraft[entryId]?.trim() || undefined;
      if (status === 'approved') {
        await adminAPI.approveEntry(entryId, notes);
      } else {
        await adminAPI.denyEntry(entryId, notes);
      }
      // remove entry from list optimistically
      setPendingEntries(prev => prev.filter(e => e.id !== entryId));
      // refresh stats (pending count, approvals/denials week)
      fetchStats();
    } catch (e: any) {
      setError(e.response?.data?.error || `Failed to ${status} entry`);
    } finally {
      setActionProcessing(null);
    }
  };

  const fetchPendingEntries = async () => {
    setLoadingApprovals(true);
    try {
      const res = await adminAPI.getPendingEntries();
      const data = res.data;
      setPendingEntries(data.entries || data || []);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to fetch pending entries');
    } finally {
      setLoadingApprovals(false);
    }
  };

  // Admin SSE subscription for pending entry events
  useEffect(() => {
    if (activeTab !== 'approvals') return; // only connect when approvals tab active
    const es = adminAPI.openAdminTimeStream?.();
    if (!es) return;
    const handlePending = () => {
      // Refresh list & stats
      fetchPendingEntries();
      fetchStats();
    };
    const handleSummary = (e: MessageEvent) => {
      // Could update a lightweight counter later; for now trigger full refresh
      try { JSON.parse(e.data); } catch (_) {}
    };
    es.addEventListener('pending-entry-created', handlePending);
    es.addEventListener('pending-entry-updated', handlePending);
    es.addEventListener('pending-entry-flagged', handlePending);
    es.addEventListener('pending-summary', handleSummary);
    es.onerror = () => {
      // Rely on EventSource auto-retry
    };
    return () => {
      es.removeEventListener('pending-entry-created', handlePending);
      es.removeEventListener('pending-entry-updated', handlePending);
      es.removeEventListener('pending-entry-flagged', handlePending);
      es.removeEventListener('pending-summary', handleSummary);
      es.close();
    };
  }, [activeTab]);

  const fetchUsers = useCallback(async () => {
    // Avoid refetch while a load is in progress
    if (loadingUsers) return;
    setLoadingUsers(true);
    try {
      const res = await adminAPI.getUsers();
      const data = res.data;
      const rawUsers = data.users || data || [];
      // Normalize numeric fields that may arrive as strings from PG (numeric type)
      const normalized = rawUsers.map((u: any) => ({
        ...u,
        hourlyRate: u.hourlyRate !== undefined && u.hourlyRate !== null ? Number(u.hourlyRate) : 0,
        taxRate: u.taxRate !== undefined && u.taxRate !== null ? Number(u.taxRate) : u.taxRate,
      }));
      setUsers(normalized);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to fetch users');
    } finally {
      setLoadingUsers(false);
    }
  }, [loadingUsers]);

  const fetchPeriodHours = useCallback(async () => {
    if (loadingPeriodHours) return;
    setLoadingPeriodHours(true);
    try {
      const res = await adminAPI.getPayrollPeriodHours();
      const data = res.data;
      const map: Record<number, PayrollPeriodUser> = {};
      (data.users || []).forEach((u: PayrollPeriodUser) => {
        map[u.userId] = u;
      });
      setPeriodHours(map);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to fetch payroll period hours');
    } finally {
      setLoadingPeriodHours(false);
    }
  }, [loadingPeriodHours]);

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const res = await adminAPI.getStats();
      setStats(prev => ({ ...prev, ...(res.data || {}) }));
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to fetch stats');
    } finally {
      setLoadingStats(false);
    }
  };

  // Initial fetch (approvals + stats). Users are lazy-loaded when tab opened.
  useEffect(() => {
    fetchPendingEntries();
    fetchStats();
  }, []);

  // Lazy load users when switching to users or payroll tab (first time only)
  useEffect(() => {
    if ((activeTab === 'users' || activeTab === 'payroll') && users.length === 0 && !loadingUsers) {
      fetchUsers();
    }
    if (activeTab === 'payroll' && Object.keys(periodHours).length === 0 && !loadingPeriodHours) {
      // Fetch period hours once when entering payroll
      fetchPeriodHours();
    }
  }, [activeTab, users.length, loadingUsers, fetchUsers, periodHours, loadingPeriodHours, fetchPeriodHours]);

  const retry = () => {
    setError(null);
    if (activeTab === 'approvals') {
      fetchPendingEntries();
      fetchStats();
    } else if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'payroll') {
      fetchUsers(); // payroll depends on users list
      fetchStats();
      fetchPeriodHours();
    }
  };

  const onKeyDown: React.KeyboardEventHandler = (e) => {
    const currentIndex = TABS.findIndex(t => t.id === activeTab);
    if (currentIndex === -1) return;
    switch (e.key) {
      case 'ArrowRight': {
        e.preventDefault();
        const next = TABS[(currentIndex + 1) % TABS.length];
        setActiveTab(next.id);
        requestAnimationFrame(() => tabRefs.current[next.id]?.focus());
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        const prev = TABS[(currentIndex - 1 + TABS.length) % TABS.length];
        setActiveTab(prev.id);
        requestAnimationFrame(() => tabRefs.current[prev.id]?.focus());
        break;
      }
      case 'Home': {
        e.preventDefault();
        setActiveTab(TABS[0].id);
        requestAnimationFrame(() => tabRefs.current[TABS[0].id]?.focus());
        break;
      }
      case 'End': {
        e.preventDefault();
        const last = TABS[TABS.length - 1];
        setActiveTab(last.id);
        requestAnimationFrame(() => tabRefs.current[last.id]?.focus());
        break;
      }
      default:
        break;
    }
  };

  return (
  <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Admin Portal</h1>
          <p className="mt-1 text-sm text-gray-600 leading-relaxed">Manage approvals, users, and payroll.</p>
        </header>
  <div className="border-b border-gray-200 overflow-x-auto backdrop-blur-sm" role="tablist" aria-label="Admin sections" onKeyDown={onKeyDown}>
          <div className="flex space-x-6 min-w-max">
            {TABS.map(t => {
              const selected = t.id === activeTab;
              return (
                <button
                  key={t.id}
                  role="tab"
                  ref={el => { tabRefs.current[t.id] = el; }}
                  id={`tab-${t.id}`}
                  aria-selected={selected}
                  aria-controls={`panel-${t.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveTab(t.id)}
                  className={`relative whitespace-nowrap py-3 px-0.5 text-sm font-medium transition-colors border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-50 ${selected ? 'text-blue-600 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'}`}
                >
                  {t.label}
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 -bottom-px h-0.5 w-full rounded-full bg-blue-500 transition-opacity ${selected ? 'opacity-100' : 'opacity-0'}`}
                  />
                </button>
              );
            })}
          </div>
        </div>
        {/* Global Portals */}
        <CreateUserModal
          isOpen={createUserOpen}
          onClose={() => setCreateUserOpen(false)}
          onSuccess={() => {
            // Refresh user list after successful creation (users tab or not)
            fetchUsers();
          }}
        />

        {error && (
          <div className="mt-6 bg-red-50 border border-red-200 text-red-700 rounded-md p-4 text-sm flex items-start gap-2">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
            <div className="flex-1">
              <p>{error}</p>
              <button onClick={retry} className="mt-2 inline-flex items-center px-2.5 py-1.5 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">Retry</button>
            </div>
          </div>
        )}

        <div className="mt-8 space-y-10">
          {/* Approvals Panel */}
          <section
            id="panel-approvals"
            role="tabpanel"
            aria-labelledby="tab-approvals"
            hidden={activeTab !== 'approvals'}
            className="focus:outline-none"
          >
            <div className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg p-6 shadow-sm space-y-6">
              <header>
                <h2 className="text-lg font-semibold text-gray-900">Time Approvals</h2>
                <p className="text-sm text-gray-600 mt-1">Review and action pending manual entries.</p>
              </header>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-md bg-blue-50 p-3">
                  <p className="text-[11px] uppercase tracking-wide font-medium text-blue-700">Pending</p>
                  <p className="mt-1 text-lg font-semibold text-blue-900">{loadingStats ? '…' : stats.pendingEntries}</p>
                </div>
                <div className="rounded-md bg-indigo-50 p-3">
                  <p className="text-[11px] uppercase tracking-wide font-medium text-indigo-700">Manual (Month)</p>
                  <p className="mt-1 text-lg font-semibold text-indigo-900">{loadingStats ? '…' : stats.totalManualThisMonth}</p>
                </div>
                <div className="rounded-md bg-green-50 p-3">
                  <p className="text-[11px] uppercase tracking-wide font-medium text-green-700">Approved (Week)</p>
                  <p className="mt-1 text-lg font-semibold text-green-900">{loadingStats ? '…' : stats.approvedThisWeek}</p>
                </div>
                <div className="rounded-md bg-rose-50 p-3">
                  <p className="text-[11px] uppercase tracking-wide font-medium text-rose-700">Denied (Week)</p>
                  <p className="mt-1 text-lg font-semibold text-rose-900">{loadingStats ? '…' : stats.deniedThisWeek}</p>
                </div>
              </div>
              {loadingApprovals ? (
                <div className="flex items-center text-sm text-gray-500">
                  <svg className="animate-spin h-5 w-5 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                  Loading pending entries…
                </div>
              ) : pendingEntries.length === 0 ? (
                <div className="text-sm text-gray-500 italic">No pending manual entries.</div>
              ) : (
                <div className="space-y-4">
                  <div className="text-xs text-gray-500">{pendingEntries.length} pending entr{pendingEntries.length === 1 ? 'y' : 'ies'}</div>
                  <div className="overflow-x-auto hidden md:block">
                    <table className="min-w-full text-sm border-separate border-spacing-0">
                      <thead className="bg-white/95 supports-backdrop-blur:bg-white/70">
                        <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          <th className="py-2 pr-4 font-medium">Employee</th>
                          <th className="py-2 pr-4 font-medium">Date</th>
                          <th className="py-2 pr-4 font-medium">In</th>
                          <th className="py-2 pr-4 font-medium">Out</th>
                          <th className="py-2 pr-4 font-medium">Duration</th>
                          {/* Description column removed */}
                          <th className="py-2 pr-0 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="align-top">
                        {pendingEntries.map(entry => {
                          const clockIn = new Date(entry.clockIn);
                          const clockOut = entry.clockOut ? new Date(entry.clockOut) : null;
                          const dateStr = clockIn.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                          const timeIn = clockIn.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit' });
                          const timeOut = clockOut ? clockOut.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit' }) : null;
                          const diff = clockOut ? (() => { const ms = clockOut.getTime() - clockIn.getTime(); const h = Math.floor(ms/3600000); const m = Math.floor((ms%3600000)/60000); return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`; })() : '—';
                          return (
                            <tr key={entry.id} className="border-t first:border-t-0 border-gray-100 align-top hover:bg-gray-50 focus-within:bg-blue-50">
                              <td className="py-3 pr-4">
                                <div className="font-medium text-gray-900 leading-snug">{entry.user?.firstName} {entry.user?.lastName}</div>
                                <div className="text-xs text-gray-500">{entry.user?.email}</div>
                              </td>
                              <td className="py-3 pr-4 whitespace-nowrap text-gray-700">{dateStr}</td>
                              <td className="py-3 pr-4 font-mono text-gray-800">{timeIn}</td>
                              <td className="py-3 pr-4 font-mono text-gray-800">{timeOut ?? <span className="text-green-600 font-medium">In</span>}</td>
                              <td className="py-3 pr-4 font-mono text-gray-800">{timeOut ? diff : <span className="text-green-600 font-medium">—</span>}</td>
                              <td className="py-3 pr-4 max-w-xs">
                                <button
                                  type="button"
                                  onClick={() => toggleExpandNotes(entry.id)}
                                  className="mt-2 text-[11px] text-blue-600 hover:text-blue-700 focus:outline-none focus:underline"
                                >
                                  {expandedNotes[entry.id] ? 'Hide Notes' : 'Add Notes'}
                                </button>
                                {expandedNotes[entry.id] && (
                                  <div className="mt-2">
                                    <label htmlFor={`notes-${entry.id}`} className="sr-only">Approval notes</label>
                                    <textarea
                                      id={`notes-${entry.id}`}
                                      rows={2}
                                      value={notesDraft[entry.id] || ''}
                                      onChange={e => setNotesDraft(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                      placeholder="Optional notes (visible to employee)"
                                      className="w-full resize-none rounded-md border-gray-300 focus:ring-blue-500 focus:border-blue-500 text-xs p-2"
                                    />
                                  </div>
                                )}
                              </td>
                              <td className="py-3 pr-0 text-right">
                                <div className="inline-flex gap-2 *:transition-colors">
                                  <button
                                    type="button"
                                    disabled={actionProcessing === entry.id}
                                    onClick={() => handleApproveDeny(entry.id, 'approved')}
                                    className={`px-2.5 py-1 rounded-md text-xs font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-green-500 ${actionProcessing === entry.id ? 'bg-green-200 text-green-600 cursor-wait' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                                    aria-label={`Approve entry for ${entry.user?.firstName} ${entry.user?.lastName}`}
                                  >{actionProcessing === entry.id ? '…' : 'Approve'}</button>
                                  <button
                                    type="button"
                                    disabled={actionProcessing === entry.id}
                                    onClick={() => handleApproveDeny(entry.id, 'denied')}
                                    className={`px-2.5 py-1 rounded-md text-xs font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-rose-500 ${actionProcessing === entry.id ? 'bg-rose-200 text-rose-600 cursor-wait' : 'bg-rose-100 text-rose-700 hover:bg-rose-200'}`}
                                    aria-label={`Deny entry for ${entry.user?.firstName} ${entry.user?.lastName}`}
                                  >{actionProcessing === entry.id ? '…' : 'Deny'}</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Mobile cards */}
                  <div className="divide-y divide-gray-100 md:hidden border border-gray-200 rounded-md overflow-hidden">
                    {pendingEntries.map(entry => {
                      const clockIn = new Date(entry.clockIn);
                      const clockOut = entry.clockOut ? new Date(entry.clockOut) : null;
                      const dateStr = clockIn.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                      const timeIn = clockIn.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit' });
                      const timeOut = clockOut ? clockOut.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit' }) : null;
                      const diff = clockOut ? (() => { const ms = clockOut.getTime() - clockIn.getTime(); const h = Math.floor(ms/3600000); const m = Math.floor((ms%3600000)/60000); return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`; })() : null;
                      return (
                        <div key={entry.id} className="p-4 flex flex-col gap-3 bg-white">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">{entry.user?.firstName} {entry.user?.lastName}</div>
                              <div className="text-xs text-gray-500 truncate">{entry.user?.email}</div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={actionProcessing === entry.id}
                                onClick={() => handleApproveDeny(entry.id, 'approved')}
                                className={`px-2 py-1 rounded-md text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-green-500 ${actionProcessing === entry.id ? 'bg-green-200 text-green-600 cursor-wait' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                                aria-label={`Approve entry for ${entry.user?.firstName} ${entry.user?.lastName}`}
                              >{actionProcessing === entry.id ? '…' : 'Approve'}</button>
                              <button
                                type="button"
                                disabled={actionProcessing === entry.id}
                                onClick={() => handleApproveDeny(entry.id, 'denied')}
                                className={`px-2 py-1 rounded-md text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-rose-500 ${actionProcessing === entry.id ? 'bg-rose-200 text-rose-600 cursor-wait' : 'bg-rose-100 text-rose-700 hover:bg-rose-200'}`}
                                aria-label={`Deny entry for ${entry.user?.firstName} ${entry.user?.lastName}`}
                              >{actionProcessing === entry.id ? '…' : 'Deny'}</button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-gray-600">
                            <div><span className="text-gray-500">Date:</span> {dateStr}</div>
                            <div><span className="text-gray-500">Duration:</span> {diff ?? <span className="text-green-600 font-medium">In Prog</span>}</div>
                            <div><span className="text-gray-500">In:</span> <span className="font-mono text-gray-800">{timeIn}</span></div>
                            <div><span className="text-gray-500">Out:</span> {timeOut ? <span className="font-mono text-gray-800">{timeOut}</span> : <span className="text-green-600 font-medium">—</span>}</div>
                          </div>
                          {/* Description removed */}
                          <div>
                            <button
                              type="button"
                              onClick={() => toggleExpandNotes(entry.id)}
                              className="text-[11px] text-blue-600 hover:text-blue-700 focus:outline-none focus:underline"
                            >{expandedNotes[entry.id] ? 'Hide Notes' : 'Add Notes'}</button>
                            {expandedNotes[entry.id] && (
                              <textarea
                                rows={2}
                                value={notesDraft[entry.id] || ''}
                                onChange={e => setNotesDraft(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                placeholder="Optional notes"
                                className="mt-2 w-full resize-none rounded-md border-gray-300 focus:ring-blue-500 focus:border-blue-500 text-[11px] p-2"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

            {/* Users Panel */}
          <section
            id="panel-users"
            role="tabpanel"
            aria-labelledby="tab-users"
            hidden={activeTab !== 'users'}
            className="focus:outline-none"
          >
            <div className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg p-6 shadow-sm space-y-6">
              <header>
                <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
                <p className="text-sm text-gray-600 mt-1">Create, edit, and provision user accounts.</p>
              </header>
              {/* Density toggle removed */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 text-[11px]">
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="uppercase tracking-wide font-medium text-slate-600">Provisioned</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{provisioningMetrics.provisioned}</p>
                </div>
                <div className="rounded-md bg-amber-50 p-3">
                  <p className="uppercase tracking-wide font-medium text-amber-700">Pending</p>
                  <p className="mt-1 text-lg font-semibold text-amber-900">{provisioningMetrics.pending}</p>
                  {provisioningMetrics.expiring > 0 && <p className="mt-1 text-[10px] text-amber-600">Expiring {provisioningMetrics.expiring}</p>}
                </div>
                <div className="rounded-md bg-rose-50 p-3">
                  <p className="uppercase tracking-wide font-medium text-rose-700">Expired</p>
                  <p className="mt-1 text-lg font-semibold text-rose-900">{provisioningMetrics.expired}</p>
                </div>
                <div className="rounded-md bg-emerald-50 p-3">
                  <p className="uppercase tracking-wide font-medium text-emerald-700">Completion</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-900">{provisioningMetrics.completionPct}%</p>
                </div>
                <div className="rounded-md bg-rose-50 p-3">
                  <p className="uppercase tracking-wide font-medium text-rose-700">High Risk</p>
                  <p className="mt-1 text-lg font-semibold text-rose-900">{provisioningMetrics.highRisk}</p>
                </div>
                <div className="rounded-md bg-amber-50 p-3">
                  <p className="uppercase tracking-wide font-medium text-amber-700">Med Risk</p>
                  <p className="mt-1 text-lg font-semibold text-amber-900">{provisioningMetrics.mediumRisk}</p>
                </div>
              </div>
              {/* Users Toolbar */}
              <div className="rounded-md border border-gray-200 bg-slate-50/80 backdrop-blur-sm p-3 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3 text-[11px] md:text-xs">
                  <div className="flex flex-col gap-0.5 text-[11px] text-gray-600 min-w-[80px]">
                    <span><span className="font-semibold text-gray-900">Total:</span> {users.length}</span>
                    <span><span className="font-semibold text-gray-900">Admins:</span> {users.filter(u => u.isAdmin).length}</span>
                    <span><span className="font-semibold text-gray-900">Unprov:</span> {users.filter(u => !u.isProvisioned).length}</span>
                  </div>
                  <label className="flex items-center gap-1 text-gray-600">
                    <span className="font-medium text-gray-800 hidden sm:inline">Filter</span>
                    <select
                      value={userFilter}
                      onChange={e => setUserFilter(e.target.value)}
                      className="border-gray-300 rounded-md text-[11px] md:text-xs focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="all">All Users</option>
                      <option value="risk:high">High Manual Risk</option>
                      <option value="risk:medium">Medium Manual Risk</option>
                      <option value="inv:expiring">Expiring Invites (&lt;48h)</option>
                      <option value="inv:expired">Expired Invites</option>
                      <option value="unprov">Unprovisioned</option>
                      <option value="prov">Provisioned</option>
                    </select>
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                      placeholder="Search name or email…"
                      className="w-44 md:w-60 rounded-md border-gray-300 text-[11px] md:text-xs focus:ring-blue-500 focus:border-blue-500"
                      aria-label="Search users"
                    />
                    {userSearch && (
                      <button type="button" onClick={() => setUserSearch('')} className="text-gray-400 hover:text-gray-600" aria-label="Clear search">
                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateUser}
                    className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs md:text-sm font-medium shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" /></svg>
                    New User
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] md:text-xs">
                  <span className="text-gray-600">Showing <span className="font-medium text-gray-900">{filteredUsers.length}</span> / {users.length}</span>
                  {activeUserFilterChips.map(chip => (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => clearUserChip(chip.key)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                      aria-label={`Remove ${chip.label}`}
                    >
                      <span>{chip.label}</span>
                      <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </button>
                  ))}
                  {activeUserFilterChips.length > 0 && (
                    <button type="button" onClick={clearAllUserFilters} className="text-gray-500 underline hover:text-gray-700">Clear All</button>
                  )}
                </div>
              </div>
              {loadingUsers && users.length === 0 ? (
                <div className="flex items-center text-sm text-gray-500">
                  <svg className="animate-spin h-5 w-5 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                  Loading users…
                </div>
              ) : users.length === 0 ? (
                <div className="text-sm text-gray-500 italic">No users loaded yet.</div>
              ) : (
                <>
                  <div className="overflow-x-auto hidden lg:block">
                    <table className="min-w-full text-sm border-separate border-spacing-0">
                      <thead className="sticky top-0 bg-white/95 backdrop-blur supports-backdrop-blur:bg-white/70 z-10 shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
                        <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-gray-600">
                          {[
                            { key: 'name', label: 'Name' },
                            { key: 'email', label: 'Email' },
                            { key: 'roles', label: 'Roles', sortable: false },
                            { key: 'provision', label: 'Provision' },
                            { key: 'entries', label: 'Entries' },
                            { key: 'manualPct', label: 'Manual %' },
                            { key: 'created', label: 'Created' }
                          ].map(col => {
                            const sortable = col.sortable !== false && ['name','email','provision','entries','manualPct','created'].includes(col.key);
                            const active = userSort.field === col.key;
                            const dir = active ? userSort.dir : undefined;
                            return (
                              <th
                                key={col.key}
                                className={`py-2 pr-4 font-medium select-none ${sortable ? 'cursor-pointer hover:text-gray-900' : ''} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white`}
                                onClick={() => {
                                  if (!sortable) return;
                                  setUserSort(s => s.field === col.key ? { field: s.field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field: col.key as any, dir: 'asc' });
                                }}
                                aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                              >
                                <span className="inline-flex items-center gap-1">
                                  {col.label}
                                  {sortable && (
                                    <svg className={`w-3 h-3 transition-transform ${!active ? 'opacity-30' : ''} ${active && dir === 'desc' ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path d="M10 5l4 6H6l4-6z" /></svg>
                                  )}
                                </span>
                              </th>
                            );
                          })}
                          <th className="py-2 pr-0 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="align-top">
                        {filteredUsers.map(u => {
                          const created = new Date(u.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                          const provisioned = u.isProvisioned ? 'Provisioned' : 'Pending';
                          const total = u.stats?.totalEntries || 0;
                          const manual = u.stats?.manualEntries || 0;
                          const ratio = total > 0 ? (manual / total) : 0;
                          const ratioPct = (ratio * 100).toFixed(1);
                          const risk = riskBadgeMeta(u);
                          return (
                            <tr
                              key={u.id}
                              className="group border-t first:border-t-0 border-gray-100 hover:bg-gray-50 cursor-pointer focus-within:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 focus-visible:ring-offset-white"
                              tabIndex={0}
                              onClick={() => handleEditUser(u.id)}
                              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleEditUser(u.id); } }}
                              aria-label={`View user details for ${u.firstName} ${u.lastName}`}
                            >
                              <td className="py-3 pr-4">
                                <div className="font-medium text-gray-900 leading-snug">{u.firstName} {u.lastName}</div>
                              </td>
                              <td className="py-3 pr-4 text-gray-700 max-w-xs truncate" title={u.email}>{u.email}</td>
                              <td className="py-3 pr-4 text-gray-700">
                                <div className="flex flex-wrap gap-1 text-[11px]">
                                  {u.isSuperUser && <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Super</span>}
                                  {u.isAdmin && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Admin</span>}
                                  {!u.isAdmin && !u.isSuperUser && <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">User</span>}
                                </div>
                              </td>
                              <td className="py-3 pr-4">
                                <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${u.isProvisioned ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{provisioned}</span>
                              </td>
                              <td className="py-3 pr-4 font-mono text-gray-800">
                                {total}
                                <span className="text-[11px] text-gray-400"> / {manual}m</span>
                              </td>
                              <td className="py-3 pr-4 text-gray-700">
                                <div className="flex items-center gap-1">
                                  <span className="font-mono text-gray-800">{ratioPct}%</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${risk.color}`}>{risk.label}</span>
                                </div>
                              </td>
                              <td className="py-3 pr-4 text-gray-700 whitespace-nowrap">{created}</td>
                              <td className="py-3 pr-4 text-right align-middle">
                                <div className="flex justify-end gap-2 min-h-[32px] pl-2">
                                  <button
                                    type="button"
                                    aria-label={`Open details for ${u.firstName} ${u.lastName}`}
                                    onClick={e => { e.stopPropagation(); handleEditUser(u.id); }}
                                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity inline-flex items-center justify-center h-8 w-8 rounded-md border border-blue-300 bg-white text-blue-500 shadow-sm hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                  {!u.isProvisioned && (
                                    <button
                                      type="button"
                                      disabled={userActionProcessing === u.id}
                                      onClick={e => { e.stopPropagation(); handleRegenerateToken(u.id); }}
                                      className={`opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity inline-flex items-center h-8 px-2.5 rounded-md border text-[11px] font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 ${userActionProcessing === u.id ? 'border-amber-300 bg-amber-100 text-amber-700 cursor-wait' : 'border-amber-300 bg-white text-amber-700 hover:bg-amber-50'}`}
                                      aria-label={`Regenerate provision token for ${u.firstName} ${u.lastName}`}
                                    >Token</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Mobile cards */}
                  <div className="divide-y divide-gray-100 lg:hidden border border-gray-200 rounded-md overflow-hidden">
                    {filteredUsers.map(u => {
                      const created = new Date(u.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                      const total = u.stats?.totalEntries || 0;
                      const manual = u.stats?.manualEntries || 0;
                      const ratio = total > 0 ? (manual / total) : 0;
                      const ratioPct = (ratio * 100).toFixed(1);
                      const risk = riskBadgeMeta(u);
                      return (
                        <div key={u.id} className="p-4 flex flex-col gap-3 bg-white"> 
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">{u.firstName} {u.lastName}</div>
                              <div className="text-xs text-gray-500 truncate" title={u.email}>{u.email}</div>
                            </div>
                            <div className="flex flex-wrap gap-1 text-[10px]">
                              {u.isSuperUser && <span className="px-1 py-0.5 rounded bg-purple-100 text-purple-700">Super</span>}
                              {u.isAdmin && <span className="px-1 py-0.5 rounded bg-blue-100 text-blue-700">Admin</span>}
                              {!u.isAdmin && !u.isSuperUser && <span className="px-1 py-0.5 rounded bg-gray-100 text-gray-600">User</span>}
                              <span className={`px-1 py-0.5 rounded ${u.isProvisioned ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{u.isProvisioned ? 'Provisioned' : 'Pending'}</span>
                              <span className={`px-1 py-0.5 rounded ${risk.color}`}>{risk.label}</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-gray-600">
                            <div><span className="text-gray-500">Entries:</span> {u.stats?.totalEntries ?? 0}</div>
                            <div><span className="text-gray-500">Manual:</span> {u.stats?.manualEntries ?? 0}</div>
                            <div><span className="text-gray-500">Manual %:</span> {ratioPct}%</div>
                            <div><span className="text-gray-500">Created:</span> {created}</div>
                            <div><span className="text-gray-500">Hourly:</span> {u.hourlyRate ?? '—'}</div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              aria-label={`Open details for ${u.firstName} ${u.lastName}`}
                              onClick={() => handleEditUser(u.id)}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-blue-300 bg-white text-blue-500 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                              </svg>
                            </button>
                            {!u.isProvisioned && (
                              <button
                                type="button"
                                disabled={userActionProcessing === u.id}
                                onClick={() => handleRegenerateToken(u.id)}
                                className={`px-2 py-1 rounded-md text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-amber-500 ${userActionProcessing === u.id ? 'bg-amber-200 text-amber-700 cursor-wait' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
                              >Token</button>
                            )}
                            {/* Delete action removed from list; handled in user details Danger Zone */}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Payroll Panel */}
          <section
            id="panel-payroll"
            role="tabpanel"
            aria-labelledby="tab-payroll"
            hidden={activeTab !== 'payroll'}
            className="focus:outline-none"
          >
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm space-y-6">
              <header>
                <h2 className="text-lg font-semibold text-gray-900">Pay Management</h2>
                <p className="text-sm text-gray-600 mt-1">Adjust employee rates & schedules.</p>
              </header>
              {loadingUsers && users.length === 0 ? (
                <div className="flex items-center text-sm text-gray-500">
                  <svg className="animate-spin h-5 w-5 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                  Loading employees…
                </div>
              ) : users.length === 0 ? (
                <div className="text-sm text-gray-500 italic">No employees loaded yet.</div>
              ) : (
                <>
                  {/* Summary Metrics (Refactored uniform cards) */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[{
                      key: 'prov', label: 'Provisioned', value: payUsers.length, bg: 'bg-slate-50', fgLabel: 'text-slate-600', fgValue: 'text-slate-900', icon: (
                        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 15c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      )}, {
                      key: 'median', label: 'Median Rate', value: `$${medianRate.toFixed(2)}`, bg: 'bg-emerald-50', fgLabel: 'text-emerald-700', fgValue: 'text-emerald-900', icon: (
                        <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 3v18M5 9l6-6 6 6M13 21l6-6-6-6" /></svg>
                      )}, {
                      key: 'baseline', label: 'Weekly Baseline', value: `$${weeklyBaseline.toFixed(0)}`, bg: 'bg-violet-50', fgLabel: 'text-violet-700', fgValue: 'text-violet-900', icon: (
                        <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13h4l3 8 4-16 3 8h4" /></svg>
                      )}, {
                      key: 'ot', label: 'Overtime Enabled', value: overtimeEnabledCount, bg: 'bg-orange-50', fgLabel: 'text-orange-700', fgValue: 'text-orange-900', icon: (
                        <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3M12 22a10 10 0 100-20 10 10 0 000 20z" /></svg>
                      )}].map(card => (
                        <div key={card.key} className={`relative overflow-hidden rounded-md p-3 flex flex-col justify-between min-h-[90px] ${card.bg}`}> 
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-[11px] uppercase tracking-wide font-medium ${card.fgLabel}`}>{card.label}</p>
                            {card.icon}
                          </div>
                          <p className={`mt-1 text-lg font-semibold ${card.fgValue}`}>{card.value}</p>
                        </div>
                      ))}
                  </div>
                  {/* Consolidated Filter Toolbar */}
                  <div className="rounded-md border border-gray-200 bg-slate-50 p-3 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-3 text-[11px] md:text-xs" aria-label="Payroll filters toolbar">
                      {/* Rate bands removed */}
                      {/* Schedule */}
                      <label className="flex items-center gap-1 text-gray-600">
                        <span className="font-medium text-gray-800 hidden sm:inline">Schedule</span>
                        <select
                          value={payAdvancedFilter.schedule}
                          onChange={e => setPayAdvancedFilter(f => ({ ...f, schedule: e.target.value }))}
                          className="border-gray-300 rounded-md text-[11px] md:text-xs focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="all">All Schedules</option>
                          {Object.keys(scheduleCounts).map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      {/* Overtime */}
                      <label className="flex items-center gap-1 text-gray-600">
                        <span className="font-medium text-gray-800 hidden sm:inline">Overtime</span>
                        <select
                          value={payAdvancedFilter.overtime}
                          onChange={e => setPayAdvancedFilter(f => ({ ...f, overtime: e.target.value }))}
                          className="border-gray-300 rounded-md text-[11px] md:text-xs focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="all">All</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </label>
                      {/* Hours */}
                      <label className="flex items-center gap-1 text-gray-600">
                        <span className="font-medium text-gray-800 hidden sm:inline">Hours</span>
                        <select
                          value={payAdvancedFilter.hours}
                          onChange={e => setPayAdvancedFilter(f => ({ ...f, hours: e.target.value }))}
                          className="border-gray-300 rounded-md text-[11px] md:text-xs focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="all">All</option>
                          <option value="gt0">&gt;0h</option>
                          <option value="eq0">=0h</option>
                          <option value="ot">Overtime</option>
                        </select>
                      </label>
                      {/* Primary quick filter (overtime / no rate) */}
                      <label className="flex items-center gap-1 text-gray-600">
                        <span className="font-medium text-gray-800 hidden sm:inline">Filter</span>
                        <select
                          value={payFilter}
                          onChange={e => setPayFilter(e.target.value)}
                          className="border-gray-300 rounded-md text-[11px] md:text-xs focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="all">All Employees</option>
                          <option value="overtime">Overtime Enabled</option>
                          <option value="no-rate">Missing Rate</option>
                        </select>
                      </label>
                      {/* Refresh */}
                      <div className="flex items-center gap-1 text-gray-500 ml-auto">
                        {loadingPeriodHours ? (
                          <>
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                            <span className="text-[11px] md:text-xs">Fetching…</span>
                          </>
                        ) : (
                          <button type="button" onClick={fetchPeriodHours} className="underline text-[11px] md:text-xs hover:text-gray-700">Refresh Hours</button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] md:text-xs">
                      <span className="text-gray-600">Showing <span className="font-medium text-gray-900">{filteredPayUsers.length}</span> / {payUsers.length}</span>
                      {activePayFilterChips.map(chip => (
                        <button
                          key={chip.key}
                          type="button"
                          onClick={() => clearPayFilterChip(chip.key)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                          aria-label={`Remove filter ${chip.label}`}
                        >
                          <span>{chip.label}</span>
                          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </button>
                      ))}
                      {activePayFilterChips.length > 0 && (
                        <button
                          type="button"
                          onClick={clearAllPayFilters}
                          className="ml-1 text-[11px] md:text-xs text-gray-500 underline hover:text-gray-700"
                        >Clear All</button>
                      )}
                    </div>
                  </div>

                  {/* Desktop table */}
                  <div className="overflow-x-auto hidden xl:block">
                    <table className="min-w-full text-sm border-separate border-spacing-0">
                      <thead className="sticky top-0 bg-white z-10">
                        <tr className="text-left text-[11px] uppercase tracking-wide text-gray-600">
                          {[
                            { key: 'name', label: 'Employee' },
                            { key: 'hours', label: 'Hours (Period)' },
                            { key: 'rate', label: 'Hourly' },
                            { key: 'overtime', label: 'Overtime', sortable: false },
                            { key: 'schedule', label: 'Schedule', sortable: false },
                            { key: 'gross', label: 'Est Gross' }
                          ].map(col => {
                            const sortable = col.sortable !== false && ['name','hours','rate','gross'].includes(col.key);
                            const active = paySort.field === col.key;
                            const dir = active ? paySort.dir : undefined;
                            return (
                              <th
                                key={col.key}
                                className={`py-2 pr-4 font-medium select-none ${sortable ? 'cursor-pointer hover:text-gray-900' : ''}`}
                                onClick={() => {
                                  if (!sortable) return;
                                  setPaySort(ps => ps.field === col.key ? { field: ps.field as any, dir: ps.dir === 'asc' ? 'desc' : 'asc' } : { field: col.key as any, dir: 'asc' });
                                }}
                                aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                              >
                                <span className="inline-flex items-center gap-1">
                                  {col.label}
                                  {sortable && (
                                    <svg className={`w-3 h-3 transition-transform ${!active ? 'opacity-30' : ''} ${active && dir === 'desc' ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                                      <path d="M10 5l4 6H6l4-6z" />
                                    </svg>
                                  )}
                                </span>
                              </th>
                            );
                          })}
                          <th className="py-2 pr-0 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="align-top">
                        {filteredPayUsers.slice().sort((a,b)=>{
                          const dir = paySort.dir === 'asc' ? 1 : -1;
                          switch (paySort.field) {
                            case 'name': {
                              const an = `${a.firstName||''} ${a.lastName||''}`.toLowerCase();
                              const bn = `${b.firstName||''} ${b.lastName||''}`.toLowerCase();
                              return an < bn ? -1*dir : an > bn ? 1*dir : 0;
                            }
                            case 'rate': return (Number(a.hourlyRate||0)-Number(b.hourlyRate||0))*dir;
                            case 'hours': {
                              const ah = periodHours[a.id]?.hours ?? -1;
                              const bh = periodHours[b.id]?.hours ?? -1;
                              return (ah-bh)*dir;
                            }
                            case 'gross': {
                              const ag = periodHours[a.id]?.estGross ?? -1;
                              const bg = periodHours[b.id]?.estGross ?? -1;
                              return (ag-bg)*dir;
                            }
                            default: return 0;
                          }
                        }).map(u => {
                          const schedule = u.paySchedule || '—';
                          return (
                            <tr
                              key={u.id}
                              className="group border-t first:border-t-0 border-gray-200 hover:bg-gray-50 cursor-pointer focus-within:bg-blue-50"
                              tabIndex={0}
                              onClick={() => handleEditUser(u.id)}
                              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleEditUser(u.id); } }}
                              aria-label={`View details for ${u.firstName} ${u.lastName}`}
                            >
                              <td className="py-3 pr-4">
                                <div className="font-medium text-gray-900 leading-snug">{u.firstName} {u.lastName}</div>
                                <div className="text-xs text-gray-500 truncate" title={u.email}>{u.email}</div>
                              </td>
                                  <td className="py-3 pr-4 font-mono text-gray-800">
                                    {periodHours[u.id] ? (
                                      <span title={`${periodHours[u.id].regularHours} regular / ${periodHours[u.id].overtimeHours} OT`}>
                                        {periodHours[u.id].hours.toFixed(2)}
                                      </span>
                                    ) : '—'}
                                  </td>
                              <td className="py-3 pr-4 font-mono text-gray-800">{typeof u.hourlyRate === 'number' ? u.hourlyRate.toFixed(2) : Number(u.hourlyRate || 0).toFixed(2)}</td>
                              <td className="py-3 pr-4">{u.overtimeEnabled ? <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[11px]">Yes</span> : <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500 text-[11px]">No</span>}</td>
                              <td className="py-3 pr-4 text-gray-700">{schedule}</td>
                              <td className="py-3 pr-4 font-mono text-gray-800">
                                {periodHours[u.id] ? `$${periodHours[u.id].estGross.toFixed(2)}` : '—'}
                              </td>
                              <td className="py-3 pr-4 text-right align-middle">
                                <div className="flex justify-end gap-2 min-h-[32px] pl-2">
                                  <button
                                    type="button"
                                    aria-label={`Open details for ${u.firstName} ${u.lastName}`}
                                    onClick={e => { e.stopPropagation(); handleEditUser(u.id); }}
                                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity inline-flex items-center justify-center h-8 w-8 rounded-md border border-blue-300 bg-white text-blue-500 shadow-sm hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile / Tablet cards (payroll) */}
                  <div className="divide-y divide-gray-200 xl:hidden border border-gray-200 rounded-md overflow-hidden">
                    {filteredPayUsers.map(u => (
                      <div key={u.id} className="p-4 flex flex-col gap-3 bg-white"> 
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{u.firstName} {u.lastName}</div>
                            <div className="text-xs text-gray-500 truncate" title={u.email}>{u.email}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1 text-[10px] text-gray-600">
                            <span className="font-mono text-gray-800">Rate ${typeof u.hourlyRate === 'number' ? u.hourlyRate.toFixed(2) : Number(u.hourlyRate || 0).toFixed(2)}</span>
                            <span className="px-1 py-0.5 rounded bg-gray-100 text-gray-600">{u.paySchedule || '—'}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-gray-600">
                          <div><span className="text-gray-500">Hours:</span> {periodHours[u.id] ? periodHours[u.id].hours.toFixed(2) : '—'}</div>
                          <div><span className="text-gray-500">Overtime:</span> {u.overtimeEnabled ? (periodHours[u.id] ? `${periodHours[u.id].overtimeHours.toFixed(2)}h` : 'Yes') : 'No'}</div>
                          <div><span className="text-gray-500">Est Gross:</span> {periodHours[u.id] ? `$${periodHours[u.id].estGross.toFixed(2)}` : '—'}</div>
                          <div><span className="text-gray-500">Reg Hrs:</span> {periodHours[u.id] ? periodHours[u.id].regularHours.toFixed(2) : '—'}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            aria-label={`Open details for ${u.firstName} ${u.lastName}`}
                            onClick={() => handleEditUser(u.id)}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-blue-300 bg-white text-blue-500 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AdminPortal;