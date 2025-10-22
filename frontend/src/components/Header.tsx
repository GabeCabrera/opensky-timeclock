import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import AccountMenu from './AccountMenu';
import NavItem from './NavItem';
import MobileBottomNav from './MobileBottomNav';

const Header: React.FC = () => {
  const { user } = useAuth();
  // Mobile drawer removed; body scroll locking no longer needed

  return (
    <header className="bg-white shadow-sm border-b border-gray-200" role="banner">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-16 gap-4">
          {/* Left cluster: mobile menu + logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Logo and Title */}
            <div className="flex items-center space-x-2">
              <Link to="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md pr-1">
                <div className="h-8 w-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h1 className="text-lg sm:text-xl font-semibold text-gray-900 whitespace-nowrap">
                  OpenSky Time Clock
                </h1>
              </Link>
            </div>
          </div>

          {/* Primary navigation (center) */}
          <nav className="hidden md:flex items-center gap-2 flex-1" aria-label="Primary">
            <NavItem
              to="/"
              label="Time Clock"
              exact
            />
            <NavItem
              to="/settings"
              label="Settings"
              icon={(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>)}
            />
            {user?.isAdmin && (
              <NavItem
                to="/admin"
                label="Admin Portal"
                icon={(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>)}
              />
            )}
          </nav>

          {/* Right utilities cluster */}
          <div className="flex items-center justify-end flex-shrink-0">
            <AccountMenu />
          </div>
        </div>
      </div>
      <MobileBottomNav />
    </header>
  );
};

export default Header;