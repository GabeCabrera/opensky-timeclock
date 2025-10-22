import React from 'react';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  icon?: React.ReactNode;
}

/**
 * AuthShell
 * ---------
 * Shared layout wrapper for authentication-related pages (login, provisioning, reset password, etc.).
 * Provides:
 *  - Consistent centered max-width container
 *  - Gradient background
 *  - Card with subtle shadow, border, and spacing
 *  - Header icon slot for brand or feature glyph
 */
const AuthShell: React.FC<AuthShellProps> = ({ title, subtitle, children, footer, icon }) => {
  return (
    <div className="min-h-screen w-full flex items-center justify-center py-10 px-4 bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center select-none">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20 ring-1 ring-white/40">
            {icon || (
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-600">{subtitle}</p>}
        </div>
        <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-xl shadow-sm shadow-slate-200 p-6 space-y-6 motion-safe:animate-fade-in">
          {children}
        </div>
        {footer && (
          <div className="mt-6 text-center text-sm text-slate-600">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthShell;
