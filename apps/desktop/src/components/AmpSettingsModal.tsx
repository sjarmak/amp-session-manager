import React, { useState, useEffect } from 'react';

interface AmpSettings {
  mode: 'production' | 'local-cli' | 'local-server';
  localCliPath?: string;
  localServerUrl?: string;
}

interface AmpSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AmpSettingsModal({ isOpen, onClose }: AmpSettingsModalProps) {
  const [settings, setSettings] = useState<AmpSettings>({
    mode: 'production',
    localCliPath: '/Users/sjarmak/amp/cli/dist/main.js',
    localServerUrl: 'https://localhost:7002',
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      const currentSettings = await window.electronAPI.amp.getSettings();
      setSettings(currentSettings);
    } catch (error) {
      console.error('Failed to load Amp settings:', error);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      await window.electronAPI.amp.updateSettings(settings);
      onClose();
    } catch (error) {
      console.error('Failed to save Amp settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gruvbox-dark1 rounded-lg shadow-xl max-w-md w-full mx-4 border border-gruvbox-dark3">
        <div className="flex items-center justify-between p-6 border-b border-gruvbox-dark3">
          <h2 className="text-xl font-semibold text-gruvbox-light0">Amp Configuration</h2>
          <button
            onClick={onClose}
            className="text-gruvbox-light3 hover:text-gruvbox-light1 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="text-sm font-medium text-gruvbox-light2 mb-3 block">
              Amp Version
            </label>
            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="ampMode"
                  value="production"
                  checked={settings.mode === 'production'}
                  onChange={(e) => setSettings({ ...settings, mode: e.target.value as any })}
                  className="mr-3 accent-gruvbox-bright-blue"
                />
                <span className="text-sm text-gruvbox-light2">Production (ampcode.com)</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="radio"
                  name="ampMode"
                  value="local-server"
                  checked={settings.mode === 'local-server'}
                  onChange={(e) => setSettings({ ...settings, mode: e.target.value as any })}
                  className="mr-3 accent-gruvbox-bright-blue"
                />
                <span className="text-sm text-gruvbox-light2">Local Development Server</span>
              </label>
              
              {settings.mode === 'local-server' && (
                <div className="ml-6">
                  <input
                    type="text"
                    value={settings.localServerUrl}
                    onChange={(e) => setSettings({ ...settings, localServerUrl: e.target.value })}
                    placeholder="https://localhost:7002"
                    className="w-full px-3 py-2 bg-gruvbox-dark0 border border-gruvbox-dark3 rounded-md text-gruvbox-light1 placeholder-gruvbox-light4 focus:outline-none focus:ring-2 focus:ring-gruvbox-bright-blue focus:border-gruvbox-bright-blue"
                  />
                </div>
              )}
              
              <label className="flex items-center">
                <input
                  type="radio"
                  name="ampMode"
                  value="local-cli"
                  checked={settings.mode === 'local-cli'}
                  onChange={(e) => setSettings({ ...settings, mode: e.target.value as any })}
                  className="mr-3 accent-gruvbox-bright-blue"
                />
                <span className="text-sm text-gruvbox-light2">Local CLI Binary</span>
              </label>
              
              {settings.mode === 'local-cli' && (
                <div className="ml-6">
                  <input
                    type="text"
                    value={settings.localCliPath}
                    onChange={(e) => setSettings({ ...settings, localCliPath: e.target.value })}
                    placeholder="/Users/sjarmak/amp/cli/dist/main.js"
                    className="w-full px-3 py-2 bg-gruvbox-dark0 border border-gruvbox-dark3 rounded-md text-gruvbox-light1 placeholder-gruvbox-light4 focus:outline-none focus:ring-2 focus:ring-gruvbox-bright-blue focus:border-gruvbox-bright-blue"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="bg-gruvbox-dark0 p-4 rounded-lg border border-gruvbox-dark3">
            <h4 className="text-sm font-medium text-gruvbox-light2 mb-2">Current Configuration</h4>
            <div className="text-xs text-gruvbox-light3 space-y-1">
              <div>Mode: <span className="font-mono text-gruvbox-bright-aqua">{settings.mode}</span></div>
              {settings.mode === 'local-server' && (
                <div>Server: <span className="font-mono text-gruvbox-bright-aqua">{settings.localServerUrl}</span></div>
              )}
              {settings.mode === 'local-cli' && (
                <div>Path: <span className="font-mono text-gruvbox-bright-aqua">{settings.localCliPath}</span></div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-gruvbox-dark3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gruvbox-light2 bg-gruvbox-dark2 border border-gruvbox-dark3 rounded-md hover:bg-gruvbox-dark3 focus:outline-none focus:ring-2 focus:ring-gruvbox-bright-blue"
          >
            Cancel
          </button>
          <button
            onClick={saveSettings}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-gruvbox-dark0 bg-gruvbox-bright-blue border border-transparent rounded-md hover:bg-gruvbox-bright-blue/90 focus:outline-none focus:ring-2 focus:ring-gruvbox-bright-blue disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
