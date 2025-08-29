'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

interface Toast {
  id: string;
  title?: string;
  description?: string;
  type?: 'default' | 'success' | 'error' | 'warning';
  duration?: number;
}

let toasts: Toast[] = [];
let listeners: Array<(toasts: Toast[]) => void> = [];

export function toast(toast: Omit<Toast, 'id'>) {
  const id = Math.random().toString(36);
  const newToast: Toast = { id, ...toast };
  
  toasts = [...toasts, newToast];
  listeners.forEach((listener) => listener([...toasts]));
  
  if (toast.duration !== 0) {
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
      listeners.forEach((listener) => listener([...toasts]));
    }, toast.duration || 5000);
  }
}

export function Toaster() {
  const [toastList, setToastList] = useState<Toast[]>([]);

  useEffect(() => {
    listeners.push(setToastList);
    return () => {
      listeners = listeners.filter((listener) => listener !== setToastList);
    };
  }, []);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 safe-area-bottom">
      <div className="space-y-2">
        {toastList.map((toast) => (
          <div
            key={toast.id}
            className={clsx(
              'rounded-lg border p-4 shadow-lg animate-slide-up',
              'bg-card text-card-foreground',
              {
                'border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100':
                  toast.type === 'success',
                'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100':
                  toast.type === 'error',
                'border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-100':
                  toast.type === 'warning',
              }
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {toast.title && (
                  <h4 className="text-sm font-semibold mb-1">{toast.title}</h4>
                )}
                {toast.description && (
                  <p className="text-sm text-muted-foreground">
                    {toast.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  toasts = toasts.filter((t) => t.id !== toast.id);
                  listeners.forEach((listener) => listener([...toasts]));
                }}
                className="ml-2 touch-target flex-shrink-0 rounded-md p-1 hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
