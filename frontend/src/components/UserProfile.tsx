import React from 'react';
import { useAuth } from '../contexts/AuthContext';

interface UserProfileProps {
  showRole?: boolean;
  size?: 'sm' | 'md' | 'lg';
  layout?: 'horizontal' | 'vertical';
  className?: string;
  // NOTE: 'showWelcome' was removed to streamline header UI per design audit (Oct 2025).
}

const UserProfile: React.FC<UserProfileProps> = ({ 
  showRole = true,
  size = 'md',
  layout = 'horizontal',
  className = '' 
}) => {
  const { user } = useAuth();

  if (!user) return null;

  // Size configurations
  const sizeConfig = {
    sm: {
      avatar: 'w-6 h-6 text-xs',
      name: 'text-xs',
      role: 'text-xs',
      spacing: 'space-x-1.5'
    },
    md: {
      avatar: 'w-8 h-8 text-sm',
      name: 'text-sm',
      role: 'text-xs',
      spacing: 'space-x-2'
    },
    lg: {
      avatar: 'w-10 h-10 text-base',
      name: 'text-base',
      role: 'text-sm',
      spacing: 'space-x-3'
    }
  };

  const config = sizeConfig[size];

  // Get user initials
  const getInitials = () => {
    const first = user.firstName?.charAt(0)?.toUpperCase() || '';
    const last = user.lastName?.charAt(0)?.toUpperCase() || '';
    return `${first}${last}`;
  };

  // Get role display
  const getRoleInfo = () => {
    if (user.isSuperUser) {
      return { text: 'Super User', badgeClass: 'badge-danger' };
    } else if (user.isAdmin) {
      return { text: 'Administrator', badgeClass: 'badge-primary' };
    } else {
      return { text: 'Employee', badgeClass: 'badge-secondary' };
    }
  };

  const roleInfo = getRoleInfo();

  if (layout === 'vertical') {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        {/* Avatar */}
        <div className={`${config.avatar} bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-medium mb-2`}>
          {getInitials()}
        </div>
        
        {/* User Info */}
        <div>
          <div className={`${config.name} font-medium text-gray-900`}>
            {user.firstName} {user.lastName}
          </div>
          {showRole && (
            <span className={`${roleInfo.badgeClass} ${config.role} mt-1 inline-block`}>
              {roleInfo.text}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Horizontal layout (default)
  return (
    <div className={`flex items-center ${config.spacing} ${className}`}>
      {/* Avatar */}
      <div className={`${config.avatar} bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-medium flex-shrink-0`}>
        {getInitials()}
      </div>
      
      {/* User Info */}
      <div className="min-w-0 flex-1">
        <div className={`${config.name} font-medium text-gray-900 truncate`}>
          {user.firstName} {user.lastName}
        </div>
        {showRole && (
          <span className={`${roleInfo.badgeClass} ${config.role} mt-0.5 inline-block`}>
            {roleInfo.text}
          </span>
        )}
      </div>
    </div>
  );
};

export default UserProfile;