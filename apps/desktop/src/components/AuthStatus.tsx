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
      <div className="flex items-center space-x-2 px-3 py-2 bg-gruvbox-dark1 border border-gruvbox-dark3/50 rounded-lg">
        <div className="animate-spin h-4 w-4 border-2 border-gruvbox-light4 border-t-gruvbox-aqua rounded-full"></div>
        <span className="text-sm text-gruvbox-light3">Checking authentication...</span>
      </div>
    );
  }

  if (authInfo.isAuthenticated && authInfo.hasCredits) {
    return (
      <div className="flex items-center justify-between px-3 py-2 bg-gruvbox-dark1 border border-gruvbox-aqua-dim/50 rounded-lg">
        <div className="flex items-center space-x-2">
          <CheckCircleIcon className="h-5 w-5 text-gruvbox-aqua" />
          <span className="text-sm font-medium text-gruvbox-aqua">Amp CLI Ready</span>
        </div>
        <button
          onClick={checkAuth}
          disabled={isRefreshing}
          className="text-xs text-gruvbox-aqua hover:text-gruvbox-light2 disabled:opacity-50"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    );
  }

  if (authInfo.isAuthenticated && authInfo.hasCredits === false) {
    return (
      <div className="flex items-center justify-between px-3 py-2 bg-gruvbox-dark1 border border-gruvbox-red rounded-lg">
        <div className="flex items-center space-x-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-gruvbox-red" />
          <div>
            <div className="text-sm font-medium text-gruvbox-light2">Insufficient Credits</div>
            <div className="text-xs text-gruvbox-light3">{authInfo.suggestion}</div>
          </div>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={handleCredits}
            className="px-3 py-1 text-xs bg-gruvbox-red text-white rounded hover:bg-gruvbox-red-dim"
          >
            Add Credits
          </button>
          <button
            onClick={checkAuth}
            disabled={isRefreshing}
            className="text-xs text-gruvbox-light3 hover:text-gruvbox-light2 disabled:opacity-50"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-gruvbox-dark1 border border-gruvbox-red rounded-lg">
      <div className="flex items-center space-x-2">
        <XCircleIcon className="h-5 w-5 text-gruvbox-red" />
        <div>
          <div className="text-sm font-medium text-gruvbox-light2">Authentication Required</div>
          <div className="text-xs text-gruvbox-light3">{authInfo.error || 'Not logged in'}</div>
        </div>
      </div>
      <div className="flex space-x-2">
        <button
          onClick={handleLogin}
          className="px-3 py-1 text-xs bg-gruvbox-red text-white rounded hover:bg-gruvbox-red-dim"
        >
          Login
        </button>
        <button
          onClick={checkAuth}
          disabled={isRefreshing}
          className="text-xs text-gruvbox-light3 hover:text-gruvbox-light2 disabled:opacity-50"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}
