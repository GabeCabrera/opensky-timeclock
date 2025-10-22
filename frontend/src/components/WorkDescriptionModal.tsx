import React, { useState } from 'react';

interface WorkDescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (workDescription: string) => void;
  loading: boolean;
}

const WorkDescriptionModal: React.FC<WorkDescriptionModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  loading
}) => {
  const [workDescription, setWorkDescription] = useState('');
  const maxLength = 200;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(workDescription.trim());
  };

  const handleSkip = () => {
    onSubmit('');
  };

  // Clear the input when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      setWorkDescription('');
    }
  }, [isOpen]);

  // Reset the work description when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setWorkDescription('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Work Summary
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              disabled={loading}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Description */}
          <p className="text-sm text-gray-600 mb-4">
            Quick summary (optional)
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <textarea
                value={workDescription}
                onChange={(e) => setWorkDescription(e.target.value)}
                placeholder="Fixed login bug, dashboard design, code review..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={4}
                maxLength={maxLength}
                disabled={loading}
              />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-gray-500">
                  Optional
                </span>
                <span className={`text-xs ${
                  workDescription.length > maxLength * 0.9 ? 'text-red-500' : 'text-gray-400'
                }`}>
                  {workDescription.length}/{maxLength}
                </span>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 inline-flex justify-center items-center px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Clocking Out...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 6h12v12H6z" />
                    </svg>
                    Clock Out
                  </>
                )}
              </button>
              
              <button
                type="button"
                onClick={handleSkip}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Skip
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default WorkDescriptionModal;