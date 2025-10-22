import React, { useState } from 'react';
import { adminAPI } from '../services/api';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CreateUserModal: React.FC<CreateUserModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState<{
    user: any;
    provisionToken: string;
    provisionTokenExpires: string;
    provisionLink?: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!firstName || !lastName || !email) {
      setError('First name, last name, and email are required');
      setLoading(false);
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    try {
      const response = await adminAPI.createUser(firstName, lastName, email, isAdmin);
      setSuccessData({
        user: response.data.user,
        provisionToken: response.data.provisionToken,
        provisionTokenExpires: response.data.provisionTokenExpires,
        provisionLink: response.data.provisionLink
      });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setIsAdmin(false);
    setError('');
    setSuccessData(null);
    onClose();
    if (successData) {
      onSuccess();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3 className="text-lg font-medium text-gray-900">
            {successData ? 'User Created Successfully' : 'Create New User'}
          </h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="modal-body">

          {!successData ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="firstName" className="form-label">
                  First Name
                </label>
                <input
                  type="text"
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="form-input"
                  placeholder="Enter first name"
                  required
                />
              </div>

              <div>
                <label htmlFor="lastName" className="form-label">
                  Last Name
                </label>
                <input
                  type="text"
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="form-input"
                  placeholder="Enter last name"
                  required
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter email address"
                  required
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isAdmin"
                  checked={isAdmin}
                  onChange={(e) => setIsAdmin(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="isAdmin" className="ml-2 block text-sm text-gray-900">
                  Admin privileges
                </label>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 border border-gray-300 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className={`px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    loading 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {loading ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">
                      User account created successfully!
                    </h3>
                    <div className="mt-2 text-sm text-green-700">
                      <strong>{successData.user.firstName} {successData.user.lastName}</strong> ({successData.user.email})
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <h4 className="text-sm font-medium text-yellow-800 mb-2 flex items-center gap-2">
                  Provisioning Details
                </h4>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <div className="flex items-center space-x-2">
                      <code className="flex-1 bg-gray-100 px-2 py-1 rounded text-sm">
                        {successData.user.email}
                      </code>
                      <button
                        onClick={() => copyToClipboard(successData.user.email)}
                        className="text-blue-600 hover:text-blue-800 text-xs"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  {successData.provisionLink && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Direct Setup Link (Preferred)
                      </label>
                      <div className="flex items-center space-x-2">
                        <code className="flex-1 bg-gray-100 px-2 py-1 rounded text-xs break-all">
                          {successData.provisionLink}
                        </code>
                        <button
                          onClick={() => copyToClipboard(successData.provisionLink!)}
                          className="text-blue-600 hover:text-blue-800 text-xs"
                        >
                          Copy
                        </button>
                      </div>
                      <p className="mt-1 text-[11px] text-gray-600">Send this link. It embeds the token & email prefilled for faster onboarding.</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Provision Token
                    </label>
                    <div className="flex items-center space-x-2">
                      <code className="flex-1 bg-gray-100 px-2 py-1 rounded text-sm break-all">
                        {successData.provisionToken}
                      </code>
                      <button
                        onClick={() => copyToClipboard(successData.provisionToken)}
                        className="text-blue-600 hover:text-blue-800 text-xs"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-gray-600 flex flex-col gap-1">
                    <span>Token expires: {new Date(successData.provisionTokenExpires).toLocaleDateString()}</span>
                    <span className="text-[11px]">An invite email was sent automatically. You can safely close this dialog; regeneration is available from the Users table if needed.</span>
                  </div>
                </div>
              </div>

              <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-[11px] leading-relaxed text-slate-600">
                <p className="font-medium text-slate-700 mb-1">Next Steps (User Perspective)</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Open the setup link (or go to /setup) and confirm email + token.</li>
                  <li>Create password (min 6 chars) & complete profile.</li>
                  <li>They are then redirected to dashboard and marked provisioned.</li>
                </ol>
                <p className="mt-2">Future enhancements: automatic reminder emails before token expiry; optional pre-assignment of pay schedule & role; import bulk CSV.</p>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateUserModal;