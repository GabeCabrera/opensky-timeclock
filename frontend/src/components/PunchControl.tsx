import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTimeLog } from '../contexts/TimeLogContext';
import { timeAPI } from '../services/api';
import { debugError } from '../utils/debug';

// PunchControl with variant support.
// Variants:
//  - minimal (default): ultra-clean, flat, near-native feel (light / enterprise minimalism)
//  - premium: richer gradient / glass styling (previous enhanced version)

interface PunchControlProps {
  variant?: 'minimal' | 'premium';
  mode?: 'clock' | 'timer'; // clock: show current time primary, timer: show elapsed primary
  showSeconds?: boolean;    // whether to show seconds in clock mode
  className?: string;       // external spacing overrides
}

const formatHMS = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

const PunchControl: React.FC<PunchControlProps> = ({
  variant = 'minimal',
  mode = 'clock',
  showSeconds = false,
  className = ''
}) => {
  const { user } = useAuth();
  const { status, updateStatus, triggerRefresh } = useTimeLog();
  const [processing, setProcessing] = useState<'in' | 'out' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState('00:00:00');
  const [now, setNow] = useState<Date>(new Date());
  const liveRef = useRef<HTMLDivElement | null>(null);

  const isActive = status?.status === 'clocked-in' && !!status?.activeEntry;

  // Elapsed timer (always maintain to show as subtext even in clock mode)
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (status?.activeEntry?.clockIn) {
      const start = new Date(status.activeEntry.clockIn);
      const tick = () => {
        const diffMs = Date.now() - start.getTime();
        if (diffMs < 0) return setElapsed('00:00:00');
        setElapsed(formatHMS(Math.floor(diffMs / 1000)));
      };
      tick();
      interval = setInterval(tick, 1000);
    } else {
      setElapsed('00:00:00');
    }
    return () => { if (interval) clearInterval(interval); };
  }, [status?.activeEntry?.clockIn]);

  // Current clock time (for clock mode)
  useEffect(() => {
    if (mode !== 'clock') return;
    const interval = setInterval(() => setNow(new Date()), showSeconds ? 1000 : 15000);
    return () => clearInterval(interval);
  }, [mode, showSeconds]);

  const announce = (msg: string) => { if (liveRef.current) liveRef.current.textContent = msg; };

  const handleClockIn = async () => {
    if (!user || processing) return;
    setError(null); setProcessing('in'); announce('Clocking in');
    try {
      await timeAPI.clockIn();
      await updateStatus();
      triggerRefresh();
      announce('You are now clocked in');
    } catch (e) {
      debugError('clock in failed', e); setError('Failed to clock in. Please try again.'); announce('Clock in failed');
    } finally { setProcessing(null); }
  };
  const handleClockOut = async () => {
    if (!user || processing || !isActive) return;
    setError(null); setProcessing('out'); announce('Clocking out');
    try {
      await timeAPI.clockOut();
      await updateStatus();
      triggerRefresh();
      announce('You are now clocked out');
    } catch (e) {
      debugError('clock out failed', e); setError('Failed to clock out. Please try again.'); announce('Clock out failed');
    } finally { setProcessing(null); }
  };

  if (!user) return null;
  const label = processing === 'in' ? 'Clocking In…' : processing === 'out' ? 'Clocking Out…' : isActive ? 'Clock Out' : 'Clock In';
  const actionHandler = isActive ? handleClockOut : handleClockIn;

  // Shared sub-elements
  const Status = () => {
    const baseDot = <span className={`h-2.5 w-2.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />;
    return (
      <div className="flex items-center gap-2">
        <span className="relative flex h-3.5 w-3.5 items-center justify-center">{baseDot}</span>
     </div>
    );
  };

  const formatClock = (d: Date) => {
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    if (!showSeconds) return `${hh}:${mm}`;
    const ss = d.getSeconds().toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  const Timer = () => {
    if (mode === 'clock') {
      return (
        <div className="relative select-none flex flex-col items-center gap-2">
          <div className="text-[3rem] sm:text-[3.25rem] font-light font-mono tabular-nums tracking-tight leading-none text-gray-900">
            {formatClock(now)}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-gray-500">
            {isActive && status?.activeEntry?.clockIn ? (
              <>
                <span className="font-medium text-gray-600">Elapsed {elapsed}</span>
              </>
            ) : (
              <span className="text-gray-500">You are currently clocked out</span>
            )}
          </div>
        </div>
      );
    }
    // timer mode (previous behavior primary)
    return (
      <div className="relative select-none flex flex-col items-center gap-2">
        <div className="text-[2.8rem] sm:text-[3.1rem] font-mono font-semibold tabular-nums tracking-tight leading-none text-gray-900">
          {elapsed}
        </div>
        {isActive && status?.activeEntry?.clockIn && (
          <div className="text-[11px] text-gray-500">Since {new Date(status.activeEntry.clockIn).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}</div>
        )}
      </div>
    );
  };

  const ActionButton = () => {
    const base = 'w-full inline-flex items-center justify-center gap-2 rounded-xl focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-progress';
    if (variant === 'minimal') {
      return (
        <button
          type="button"
          onClick={actionHandler}
          disabled={!!processing}
          aria-pressed={isActive}
          className={`${base} mt-6 px-6 py-3 text-sm font-medium border ${isActive ? 'border-red-400 text-red-600 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-400/50' : 'border-gray-300 text-gray-700 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-indigo-400/50'} bg-white/60 backdrop-blur-sm`}
        >
          {processing && (
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4zm2 5.29A7.96 7.96 0 014 12H0c0 3.04 1.14 5.82 3 7.94l3-2.65z" />
            </svg>
          )}
          {!processing && (isActive ? (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          ))}
          <span>{label}</span>
        </button>
      );
    }
    // premium variant
    return (
      <button
        type="button"
        onClick={actionHandler}
        disabled={!!processing}
        aria-pressed={isActive}
        className={`mt-7 w-full inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-3.5 text-sm font-semibold tracking-wide focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 transition-all disabled:opacity-60 disabled:cursor-progress relative overflow-hidden
          ${isActive ? 'bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-500 hover:to-red-500 focus-visible:ring-red-500 text-white shadow-sm hover:shadow-md' : 'bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-500 hover:to-violet-400 focus-visible:ring-indigo-500 text-white shadow-sm hover:shadow-md'}`}
      >
        <span className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity bg-[radial-gradient(circle_at_30%_20%,white,transparent_60%)]" aria-hidden="true" />
        {processing && (
          <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4zm2 5.29A7.96 7.96 0 014 12H0c0 3.04 1.14 5.82 3 7.94l3-2.65z" />
          </svg>
        )}
        {!processing && (isActive ? (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        ))}
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div aria-label="Time tracking control" className={`relative ${className}`}>
      <div ref={liveRef} className="sr-only" aria-live="polite" />
      <div className={
        variant === 'minimal'
          ? 'rounded-xl border border-gray-200/70 bg-white/70 backdrop-blur-sm px-5 sm:px-6 py-5 flex flex-col gap-5'
          : 'group rounded-3xl bg-gradient-to-br from-white/70 via-white/50 to-white/30 backdrop-blur-xl ring-1 ring-black/5 hover:ring-black/10 transition-all duration-300 shadow-[0_2px_4px_-2px_rgba(0,0,0,0.06),0_4px_12px_-2px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_10px_-2px_rgba(0,0,0,0.08),0_10px_28px_-6px_rgba(0,0,0,0.06)] px-6 sm:px-8 pt-6 pb-8 flex flex-col gap-6'
      }>
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <Status />
          </div>
          {/* {mode === 'timer' && (
            <div className="text-[11px] text-gray-500 font-medium pl-5">Mode: Timer</div>
          )} */}
        </div>
        {/* Main display */}
        <Timer />
        {/* Actions */}
        <ActionButton />
        {error && (
          <div className={variant === 'minimal' ? 'mt-1 text-xs text-red-600 flex items-center gap-2' : 'mt-2 text-sm text-red-600 flex items-center gap-2'} role="alert">
            <svg className="w-4 h-4" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
            <span>{error}</span>
            <button onClick={() => { setError(null); isActive ? handleClockOut() : handleClockIn(); }} className="underline decoration-dotted">Retry</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PunchControl;
