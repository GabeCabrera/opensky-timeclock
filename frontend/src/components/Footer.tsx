import React from 'react';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="md:flex md:items-center md:justify-between">
          {/* Left side - Company info */}
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">OpenSky Time Clock</p>
              <p className="text-xs text-gray-500">Time tracking made simple</p>
            </div>
          </div>

          {/* Right side - Links and copyright */}
          <div className="mt-4 md:mt-0">
            <div className="flex items-center space-x-6 text-sm text-gray-500">
              <a 
                href="#" 
                className="hover:text-gray-700 transition-colors"
                onClick={(e) => e.preventDefault()}
              >
                Privacy Policy
              </a>
              <a 
                href="#" 
                className="hover:text-gray-700 transition-colors"
                onClick={(e) => e.preventDefault()}
              >
                Terms of Service
              </a>
              <a 
                href="#" 
                className="hover:text-gray-700 transition-colors"
                onClick={(e) => e.preventDefault()}
              >
                Support
              </a>
            </div>
            <p className="mt-2 text-xs text-gray-400 text-right">
              © {currentYear} OpenSky. All rights reserved.
            </p>
          </div>
        </div>

        {/* Bottom section - Additional info */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-gray-400">
            <p>
              Built with React, TypeScript, and Express.js
            </p>
            <p className="mt-2 sm:mt-0">
              Version 1.0.0
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;