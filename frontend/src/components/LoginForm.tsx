import React, { useState, useRef } from 'react';
import { authAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import TextField from './ui/TextField';
import AuthShell from './ui/AuthShell';

interface LoginFormProps {
  onToggleSetup: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onToggleSetup }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setEmailError(null);
    setPasswordError(null);

    // Inline validation
    if (!email) {
      setEmailError('Email is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Enter a valid email');
    }
    if (!password) {
      setPasswordError('Password is required');
    }
    if (emailError || passwordError || !email || !password) {
      setLoading(false);
      requestAnimationFrame(() => statusRef.current?.focus());
      return;
    }

    try {
      const response = await authAPI.login(email, password);
      login(response.data.token, response.data.user);
    } catch (err: any) {
      if (err.response?.data?.needsProvisioning) {
        setError('Account not yet set up. Use your provision token to complete setup.');
      } else {
        setError(err.response?.data?.error || 'Unable to sign in');
      }
      requestAnimationFrame(() => statusRef.current?.focus());
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="OpenSky Time Clock"
      subtitle="Sign in to your account"
      footer={(
        <>
          Need to set up your account?{' '}
          <button
            type="button"
            onClick={() => {
              onToggleSetup();
              setEmail('');
              setPassword('');
              setError('');
              setShowPassword(false);
            }}
            className="text-blue-600 hover:text-blue-700 font-medium focus:outline-none focus:underline"
          >
            Complete Account Setup
          </button>
        </>
      )}
    >
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setEmailError(null); }}
            error={emailError || undefined}
            placeholder="you@example.com"
            autoComplete="email"
            disabled={loading}
          />

          <TextField
            label="Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => { setPassword(e.target.value); setPasswordError(null); }}
            error={passwordError || undefined}
            placeholder="••••••••"
            autoComplete="current-password"
            disabled={loading}
            endAdornment={(
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 focus:outline-none"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                disabled={loading}
              >
                {showPassword ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L8.464 8.464M9.878 9.878a3 3 0 104.243 4.243m0 0L12.707 12.707M9.878 9.878l-6.415-6.414a1 1 0 011.414-1.414l12.728 12.728a1 1 0 01-1.414 1.414L12.707 12.707" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            )}
          />

          <div
            ref={statusRef}
            tabIndex={-1}
            aria-live="polite"
            className="outline-none"
          >
            {error && (
              <div className="alert-error">
                {error}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex justify-center items-center px-4 py-2.5 rounded-md bg-blue-600 text-white font-medium shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </div>
            ) : 'Sign In'}
          </button>
        </form>
    </AuthShell>
  );
};

export default LoginForm;