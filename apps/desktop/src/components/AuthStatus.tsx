import React, { useState, useEffect } from 'react';
import { CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon } from '@heroicons/react/24/outline';

interface AuthStatusProps {
  onAuthRequired?: () => void;
}

interface AuthInfo {
  isAuthenticated: boolean;
  error?: string;
  suggestion?: string;
  hasCredits?: boolean;
  loading?: boolean;
}

export function AuthStatus({ onAuthRequired }: AuthStatusProps) {
  const [authInfo, setAuthInfo] = useState<AuthInfo>({ isAuthenticated: false, loading: true });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const checkAuth = async () => {
    setIsRefreshing(true);
    try {
      const result = await window.electronAPI.validateAuth();
      setAuthInfo({ ...result, loading: false });
    } catch (error) {
      setAuthInfo({
        isAuthenticated: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        loading: false
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const handleLogin = async () => {
    try {
      await window.electronAPI.openExternal('https://ampcode.com/auth/cli-login');
      // Wait a bit then refresh
      setTimeout(checkAuth, 2000);
    } catch (error) {
      console.error('Failed to open login URL:', error);
    }
  };

  const handleCredits = async () => {
    try {
      await window.electronAPI.openExternal('https://ampcode.com/settings');
    } catch (error) {
      console.error('Failed to open settings:', error);
    }
  };

  if (authInfo.loading) {
    return (
      <div className="flex items-center space-x-2 px-3 py-2 bg-gray-50 rounded-lg">
        <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-gray-600 rounded-full"></div>
        <span className="text-sm text-gray-600">Checking authentication...</span>
      </div>
    );
  }

  if (authInfo.isAuthenticated && authInfo.hasCredits) {
    return (
      <div className="flex items-center justify-between px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-center space-x-2">
          <CheckCircleIcon className="h-5 w-5 text-green-500" />
          <span className="text-sm font-medium text-green-800">Amp CLI Ready</span>
        </div>
        <button
          onClick={checkAuth}
          disabled={isRefreshing}
          className="text-xs text-green-600 hover:text-green-800 disabled:opacity-50"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    );
  }

  if (authInfo.isAuthenticated && authInfo.hasCredits === false) {
    return (
      <div className="flex items-center justify-between px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-center space-x-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />
          <div>
            <div className="text-sm font-medium text-yellow-800">Insufficient Credits</div>
            <div className="text-xs text-yellow-600">{authInfo.suggestion}</div>
          </div>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={handleCredits}
            className="px-3 py-1 text-xs bg-yellow-600 text-white rounded hover:bg-yellow-700"
          >
            Add Credits
          </button>
          <button
            onClick={checkAuth}
            disabled={isRefreshing}
            className="text-xs text-yellow-600 hover:text-yellow-800 disabled:opacity-50"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
      <div className="flex items-center space-x-2">
        <XCircleIcon className="h-5 w-5 text-red-500" />
        <div>
          <div className="text-sm font-medium text-red-800">Authentication Required</div>
          <div className="text-xs text-red-600">{authInfo.error || 'Not logged in'}</div>
        </div>
      </div>
      <div className="flex space-x-2">
        <button
          onClick={handleLogin}
          className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
        >
          Login
        </button>
        <button
          onClick={checkAuth}
          disabled={isRefreshing}
          className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}
