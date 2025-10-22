import React from 'react';

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
  error?: string | null;
  hideLabel?: boolean;
  containerClassName?: string;
  endAdornment?: React.ReactNode; // Optional element rendered inside the input on the right (e.g., password toggle)
}

/**
 * TextField
 * ---------
 * Reusable accessible text input with modern styling.
 * - Uses focus-visible & ring for accessibility
 * - Inline error & description support
 * - Accepts standard input props (type, name, value, onChange, etc.)
 */
export const TextField: React.FC<TextFieldProps> = ({
  label,
  description,
  error,
  hideLabel = false,
  id,
  className = '',
  containerClassName = '',
  endAdornment,
  ...inputProps
}) => {
  // Generate a stable id once; do not call hook conditionally
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const descId = description ? `${inputId}-desc` : undefined;
  const errorId = error ? `${inputId}-err` : undefined;
  const describedBy = [error ? errorId : null, description ? descId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`flex flex-col ${containerClassName}`}>
      <label htmlFor={inputId} className={`${hideLabel ? 'sr-only' : 'text-sm font-medium text-gray-700 mb-1'} ${error ? 'text-red-700' : ''}`}>
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={`rounded-md border text-sm w-full px-3 py-2 shadow-sm focus:outline-none transition-colors placeholder:text-gray-400 focus:ring-2 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-60 ${error ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'} ${endAdornment ? 'pr-10' : ''} ${className}`}
          {...inputProps}
        />
        {endAdornment && (
          <div className="absolute inset-y-0 right-2 flex items-center">
            {React.isValidElement(endAdornment) ? React.cloneElement(endAdornment as any, {
              className: `${(endAdornment as any).props?.className || ''} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 rounded-md transition-colors`}
            ) : endAdornment}
          </div>
        )}
      </div>
      {description && !error && (
        <p id={descId} className="mt-1 text-xs text-gray-500">{description}</p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
};

export default TextField;
