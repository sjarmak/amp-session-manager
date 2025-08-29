'use client';

import { useState } from 'react';
import { useTheme } from 'next-themes';
import { BottomNavigation } from '@/components/ui/navigation';
import { 
  Settings as SettingsIcon,
  Moon,
  Sun,
  Smartphone,
  Server,
  Key,
  Folder,
  Info
} from 'lucide-react';
import { clsx } from 'clsx';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [apiUrl, setApiUrl] = useState(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000');
  const [apiToken, setApiToken] = useState('');

  const themeOptions = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Smartphone },
  ];

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-card border-b border-border p-4 safe-area-top">
        <div className="flex items-center">
          <SettingsIcon className="h-6 w-6 text-primary mr-2" />
          <h1 className="text-xl font-bold text-foreground">Settings</h1>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto mobile-scroll pb-20">
        <div className="p-4 space-y-6">
          {/* Theme Settings */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">Appearance</h2>
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-medium text-foreground mb-3">Theme</h3>
              <div className="grid grid-cols-3 gap-2">
                {themeOptions.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    className={clsx(
                      'flex flex-col items-center p-3 rounded-lg border transition-colors touch-target',
                      theme === value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background hover:bg-muted/50 text-muted-foreground'
                    )}
                  >
                    <Icon className="h-5 w-5 mb-2" />
                    <span className="text-sm font-medium">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Server Settings */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">Server Connection</h2>
            <div className="bg-card rounded-lg border border-border p-4 space-y-4">
              <div>
                <label className="flex items-center text-sm font-medium text-foreground mb-2">
                  <Server className="h-4 w-4 mr-2" />
                  API Server URL
                </label>
                <input
                  type="url"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="http://localhost:3000"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground touch-target"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  URL of the Amp Session Manager server
                </p>
              </div>

              <div>
                <label className="flex items-center text-sm font-medium text-foreground mb-2">
                  <Key className="h-4 w-4 mr-2" />
                  API Token (Optional)
                </label>
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="Your API token"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground touch-target"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Required if server has authentication enabled
                </p>
              </div>

              <button className="w-full bg-primary text-primary-foreground py-2 rounded-lg touch-target font-medium">
                Test Connection
              </button>
            </div>
          </section>

          {/* Repository Settings */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">Repositories</h2>
            <div className="bg-card rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="flex items-center font-medium text-foreground mb-1">
                    <Folder className="h-4 w-4 mr-2" />
                    Repository Roots
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Manage directories where repositories are scanned
                  </p>
                </div>
                <button className="bg-primary text-primary-foreground px-4 py-2 rounded-lg touch-target text-sm">
                  Manage
                </button>
              </div>
            </div>
          </section>

          {/* App Info */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">About</h2>
            <div className="bg-card rounded-lg border border-border p-4">
              <div className="flex items-start">
                <Info className="h-5 w-5 text-muted-foreground mr-3 mt-0.5" />
                <div>
                  <h3 className="font-medium text-foreground mb-2">Amp Session Manager Mobile</h3>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Version: 0.1.0</p>
                    <p>Build: PWA</p>
                    <p>Compatible with: Amp Session Manager v2+</p>
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-border">
                    <h4 className="font-medium text-foreground mb-2">Features</h4>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Touch-optimized interface</li>
                      <li>Offline capability</li>
                      <li>Real-time session monitoring</li>
                      <li>Pull-to-refresh support</li>
                      <li>Add to Home Screen</li>
                    </ul>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border">
                    <h4 className="font-medium text-foreground mb-2">Installation</h4>
                    <p className="text-sm text-muted-foreground">
                      Add this app to your home screen for the best experience. 
                      Look for the "Add to Home Screen" option in your browser menu.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* PWA Installation Banner */}
          <div className="browser-only">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-center">
              <Smartphone className="h-8 w-8 text-primary mx-auto mb-2" />
              <h3 className="font-medium text-primary mb-2">Install App</h3>
              <p className="text-sm text-primary/80 mb-3">
                Add Amp Session Manager to your home screen for quick access and a native app experience.
              </p>
              <button
                onClick={() => {
                  // PWA install prompt would be handled here
                  alert('Use your browser\'s "Add to Home Screen" option to install this app');
                }}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-lg touch-target text-sm"
              >
                Add to Home Screen
              </button>
            </div>
          </div>
        </div>
      </div>

      <BottomNavigation />
    </div>
  );
}
