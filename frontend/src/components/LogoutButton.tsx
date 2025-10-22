import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';
import { debugError } from '../utils/debug';

interface LogoutButtonProps {
  variant?: 'minimal' | 'button' | 'icon-only';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  iconPosition?: 'left' | 'right';
}

const LogoutButton: React.FC<LogoutButtonProps> = ({ 
  variant = 'button',
  size = 'md',
  className = '',
  iconPosition = 'left'
}) => {
  const { logout, isAuthenticated } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await authAPI.logout();
    } catch (error) {
      debugError('Logout error:', error);
    } finally {
      logout();
      setIsLoggingOut(false);
    }
  };

  if (!isAuthenticated) return null;

  // Size configurations
  const sizeConfig = {
    sm: {
      text: 'text-xs',
      icon: 'w-3 h-3',
      padding: 'px-2 py-1',
      spacing: 'space-x-1'
    },
    md: {
      text: 'text-sm',
      icon: 'w-4 h-4',
      padding: 'px-3 py-2',
      spacing: 'space-x-2'
    },
    lg: {
      text: 'text-base',
      icon: 'w-5 h-5',
      padding: 'px-4 py-2',
      spacing: 'space-x-2'
    }
  };

  const config = sizeConfig[size];

  // Loading spinner icon
  const LoadingIcon = () => (
    <svg 
      className={`animate-spin ${config.icon} text-gray-500`} 
      xmlns="http://www.w3.org/2000/svg" 
      fill="none" 
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );

  // Logout icon
  const LogoutIcon = () => (
    <svg className={config.icon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );

  // Variant styles
  const getVariantClasses = () => {
    switch (variant) {
      case 'minimal':
        return `${config.text} text-gray-600 hover:text-gray-900 transition-colors p-1 hover:bg-gray-50 rounded-md`;
      case 'icon-only':
        return `${config.padding} text-gray-600 hover:text-gray-900 transition-colors hover:bg-gray-50 rounded-md`;
      case 'button':
      default:
        return `inline-flex items-center ${config.padding} border border-gray-300 shadow-sm ${config.text} leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200`;
    }
  };

  const buttonClasses = `${getVariantClasses()} disabled:opacity-50 disabled:cursor-not-allowed ${className}`;

  const renderContent = () => {
    if (variant === 'icon-only') {
      return isLoggingOut ? <LoadingIcon /> : <LogoutIcon />;
    }

    const text = isLoggingOut ? 'Signing out...' : 'Sign out';
    const icon = isLoggingOut ? <LoadingIcon /> : <LogoutIcon />;

    if (iconPosition === 'right') {
      return (
        <div className={`flex items-center ${config.spacing}`}>
          <span>{text}</span>
          {icon}
        </div>
      );
    }

    // Default: icon on left
    return (
      <div className={`flex items-center ${config.spacing}`}>
        {icon}
        <span className={variant === 'minimal' ? 'hidden sm:inline' : ''}>{text}</span>
      </div>
    );
  };

  return (
    <button
      onClick={handleLogout}
      disabled={isLoggingOut}
      className={buttonClasses}
      title="Sign out of your account"
    >
      {renderContent()}
    </button>
  );
};

export default LogoutButton;