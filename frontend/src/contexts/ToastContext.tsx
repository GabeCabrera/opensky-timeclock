import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  ttl?: number; // ms
}

interface ToastContextType {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToasts = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToasts must be used inside ToastProvider');
  return ctx;
};

const genId = () => Math.random().toString(36).slice(2, 10);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = genId();
    const ttl = toast.ttl ?? 5000;
    const full: Toast = { id, ...toast, ttl };
    setToasts(prev => [...prev, full]);
    if (ttl > 0) {
      setTimeout(() => remove(id), ttl);
    }
  }, [remove]);

  const clear = useCallback(() => setToasts([]), []);

  return (
    <ToastContext.Provider value={{ toasts, push, remove, clear }}>
      {children}
      <div className="fixed inset-x-0 top-4 z-50 flex flex-col items-center space-y-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto shadow-lg rounded-md px-4 py-3 min-w-[260px] max-w-sm flex items-start space-x-3 text-sm font-medium animate-slide-down bg-white border
              ${t.type === 'success' ? 'border-green-300 text-green-800' : ''}
              ${t.type === 'error' ? 'border-red-300 text-red-800' : ''}
              ${t.type === 'info' ? 'border-blue-300 text-blue-800' : ''}
              ${t.type === 'warning' ? 'border-yellow-300 text-yellow-800' : ''}`}
          >
            <div className="flex-1">{t.message}</div>
            <button
              onClick={() => remove(t.id)}
              className="ml-2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
