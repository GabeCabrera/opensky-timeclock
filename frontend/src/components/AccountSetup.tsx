import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import AuthShell from './ui/AuthShell';
import TextField from './ui/TextField';

interface AccountSetupProps {
  onCancel: () => void;
}

const AccountSetup: React.FC<AccountSetupProps> = ({ onCancel }) => {
  const [email, setEmail] = useState('');
  const [provisionToken, setProvisionToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const [tokenValid, setTokenValid] = useState(false);
  const [userInfo, setUserInfo] = useState<{firstName: string; lastName: string; email: string} | null>(null);
  const { login } = useAuth();
  const location = useLocation();

  // Prefill from query params once
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const qpEmail = params.get('email');
      const qpToken = params.get('token');
      if (qpEmail) setEmail(qpEmail);
      if (qpToken) setProvisionToken(qpToken);
    } catch (_) { /* ignore */ }
  // run only on initial mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateToken = useCallback(async () => {
    if (!email || !provisionToken) {
      setTokenValid(false);
      setUserInfo(null);
      return;
    }

    setValidating(true);
    setError('');

    try {
      const response = await authAPI.validateProvisionToken(email, provisionToken);
      setTokenValid(true);
      setUserInfo(response.data.user);
    } catch (err: any) {
      setTokenValid(false);
      setUserInfo(null);
      setError(err.response?.data?.error || 'Invalid email or provision token');
      requestAnimationFrame(() => statusRef.current?.focus());
    } finally {
      setValidating(false);
    }
  }, [email, provisionToken]);

  useEffect(() => {
    const delayedValidation = setTimeout(() => {
      if (email && provisionToken) {
        validateToken();
      }
    }, 500);

    return () => clearTimeout(delayedValidation);
  }, [email, provisionToken, validateToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setError('');
    setEmailError(null);
    setTokenError(null);
    setPasswordError(null);
    setConfirmError(null);

    if (!email) setEmailError('Email required');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) setEmailError('Enter a valid email');
    if (!provisionToken) setTokenError('Token required');
    if (password.length < 6) setPasswordError('Min 6 characters');
    if (confirmPassword !== password) setConfirmError('Passwords must match');
    if (!tokenValid) setTokenError('Validate token first');
    if (emailError || tokenError || passwordError || confirmError || !tokenValid || !email || !provisionToken || !password || !confirmPassword || password !== confirmPassword || password.length < 6) {
      requestAnimationFrame(() => statusRef.current?.focus());
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await authAPI.setup(email, provisionToken, password);
      login(response.data.token, response.data.user);
    } catch (err: any) {
      setError(err.response?.data?.error || 'An error occurred during setup');
      requestAnimationFrame(() => statusRef.current?.focus());
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Complete Account Setup"
      subtitle="Enter your provision token and create a password"
      footer={(<button onClick={onCancel} type="button" className="text-blue-600 hover:text-blue-700 font-medium focus:outline-none focus:underline">Back to Login</button>)}
    >
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <TextField
            label="Email Address"
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setEmailError(null); }}
            error={emailError || undefined}
            placeholder="you@example.com"
            autoComplete="email"
            disabled={loading}
          />

          <TextField
            label="Provision Token"
            value={provisionToken}
            onChange={e => { setProvisionToken(e.target.value); setTokenError(null); }}
            error={tokenError || undefined}
            placeholder="Paste your token"
            disabled={loading}
          />
          {validating && (
            <div className="text-sm text-gray-500">Validating token...</div>
          )}

          {tokenValid && userInfo && (
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">
                    Valid Token
                  </h3>
                  <div className="mt-2 text-sm text-green-700">
                    Setting up account for: <strong>{userInfo.firstName} {userInfo.lastName}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tokenValid && (
            <>
              <TextField
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setPasswordError(null); }}
                error={passwordError || undefined}
                placeholder="Create a password"
                autoComplete="new-password"
                disabled={loading}
                endAdornment={(
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-600 focus:outline-none"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      {showPassword ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      )}
                    </svg>
                  </button>
                )}
              />
              <TextField
                label="Confirm Password"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); setConfirmError(null); }}
                error={confirmError || undefined}
                placeholder="Confirm password"
                autoComplete="new-password"
                disabled={loading}
              />
            </>
          )}

          <div
            aria-live="polite"
            tabIndex={-1}
            ref={statusRef}
            className="outline-none"
          >
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">{error}</div>
            )}
          </div>

          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading || !tokenValid}
              className="flex-1 inline-flex justify-center items-center px-4 py-2.5 rounded-md bg-blue-600 text-white font-medium shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Setting up...' : 'Complete Setup'}
            </button>
          </div>
        </form>
    </AuthShell>
  );
};

export default AccountSetup;