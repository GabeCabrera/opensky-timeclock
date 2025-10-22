import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface NavItemProps {
  to: string;
  label: string;
  icon?: React.ReactNode;
  exact?: boolean;
  className?: string;
}

// Centralized navigation item for consistent styling & accessibility
const NavItem: React.FC<NavItemProps> = ({ to, label, icon, exact = false, className = '' }) => {
  const location = useLocation();
  const isActive = exact ? location.pathname === to : location.pathname.startsWith(to);

  return (
    <Link
      to={to}
      aria-current={isActive ? 'page' : undefined}
      className={`group inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors
        focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2
        ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}
        ${className}`}
    >
      {icon && (
        <span className={`flex-shrink-0 ${isActive ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-500'} w-4 h-4`}> 
          {icon}
        </span>
      )}
      <span className="truncate">{label}</span>
    </Link>
  );
};

export default NavItem;