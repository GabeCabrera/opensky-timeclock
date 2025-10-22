import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const MobileBottomNav: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();

  const items = [
    { to: '/', label: 'Clock', icon: (<svg className="w-5 h-5" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 3"/><path d="M12 22a10 10 0 110-20 10 10 0 010 20z"/></svg>) },
    { to: '/settings', label: 'Settings', icon: (<svg className="w-5 h-5" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>) },
  ];
  if (user?.isAdmin) {
    items.push({ to: '/admin', label: 'Admin', icon: (<svg className="w-5 h-5" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4"/><path d="M21.618 7.984A11.955 11.955 0 0012 2.944 11.955 11.955 0 003.382 7.984 12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>) });
  }

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 shadow-sm pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex justify-around items-stretch h-16">
        {items.map(item => {
          const active = location.pathname === item.to;
          return (
            <li key={item.to} className="flex-1">
              <Link
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={`group relative flex flex-col items-center justify-center h-full text-[11px] font-medium tracking-wide transition-colors select-none ${active ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <span
                  className={`flex items-center justify-center w-9 h-9 rounded-full mb-1 transition-colors ${active ? 'bg-indigo-50 text-indigo-600' : 'bg-transparent'}`}
                >
                  {item.icon}
                </span>
                <span className="leading-none mt-0.5" style={{ minHeight: '0.9rem' }}>{item.label}</span>
                {/* Active indicator underline (space reserved to prevent shift) */}
                <span
                  className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full transition-all duration-200 ${active ? 'bg-indigo-600 opacity-100 scale-100' : 'bg-indigo-600 opacity-0 scale-75'}`}
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default MobileBottomNav;
