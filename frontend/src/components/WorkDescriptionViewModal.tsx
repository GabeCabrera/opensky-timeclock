import React from 'react';

interface WorkDescriptionViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  workDescription: string;
  entryDate: string;
}

const WorkDescriptionViewModal: React.FC<WorkDescriptionViewModalProps> = ({
  isOpen,
  onClose,
  workDescription,
  entryDate
}) => {
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
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Date */}
          <p className="text-sm text-gray-500 mb-4">
            {entryDate}
          </p>

          {/* Description */}
          <div className="mb-6">
            <div className="bg-gray-50 rounded-lg p-4 border">
              <p className="text-gray-900 whitespace-pre-wrap">
                {workDescription || 'No description provided'}
              </p>
            </div>
          </div>

          {/* Close Button */}
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkDescriptionViewModal;