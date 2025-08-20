import React, { useState, useEffect } from 'react';

interface NotificationSettings {
  enabled: boolean;
  types: {
    sessionComplete: boolean;
    awaitingInput: boolean;
    conflict: boolean;
    testResults: boolean;
    statusChange: boolean;
  };
  sound: boolean;
  duration: number;
}

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationSettingsModal({ isOpen, onClose }: NotificationSettingsModalProps) {
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: true,
    types: {
      sessionComplete: true,
      awaitingInput: true,
      conflict: true,
      testResults: true,
      statusChange: true,
    },
    sound: true,
    duration: 5000,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      const currentSettings = await window.electronAPI.notifications.getSettings();
      setSettings(currentSettings);
    } catch (error) {
      console.error('Failed to load notification settings:', error);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await window.electronAPI.notifications.updateSettings(settings);
      onClose();
    } catch (error) {
      console.error('Failed to save notification settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestNotification = async (type: string) => {
    try {
      await window.electronAPI.notifications.test(type);
    } catch (error) {
      console.error('Failed to test notification:', error);
    }
  };

  const notificationTypes = [
    { key: 'sessionComplete', label: 'Session Complete', description: 'When a session finishes successfully' },
    { key: 'awaitingInput', label: 'Awaiting Input', description: 'When a session needs user attention' },
    { key: 'conflict', label: 'Merge Conflicts', description: 'When rebase conflicts occur' },
    { key: 'testResults', label: 'Test Results', description: 'When test scripts complete' },
    { key: 'statusChange', label: 'Status Changes', description: 'General session status updates' },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Notification Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          {/* Master Enable/Disable */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Enable Notifications</h3>
              <p className="text-sm text-gray-500">Turn all desktop notifications on or off</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only"
                checked={settings.enabled}
                onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
              />
              <div className={`w-11 h-6 rounded-full ${settings.enabled ? 'bg-blue-600' : 'bg-gray-200'} relative transition-colors`}>
                <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${settings.enabled ? 'translate-x-5' : 'translate-x-0.5'}`}></div>
              </div>
            </label>
          </div>

          {/* Notification Types */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-900">Notification Types</h3>
            {notificationTypes.map(({ key, label, description }) => (
              <div key={key} className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <label className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{label}</div>
                      <div className="text-sm text-gray-500">{description}</div>
                    </label>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleTestNotification(key)}
                    className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 border border-blue-200 rounded"
                  >
                    Test
                  </button>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={settings.types[key as keyof typeof settings.types]}
                      onChange={(e) => setSettings({
                        ...settings,
                        types: {
                          ...settings.types,
                          [key]: e.target.checked
                        }
                      })}
                      disabled={!settings.enabled}
                    />
                    <div className={`w-11 h-6 rounded-full ${settings.enabled && settings.types[key as keyof typeof settings.types] ? 'bg-blue-600' : 'bg-gray-200'} relative transition-colors`}>
                      <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${settings.enabled && settings.types[key as keyof typeof settings.types] ? 'translate-x-5' : 'translate-x-0.5'}`}></div>
                    </div>
                  </label>
                </div>
              </div>
            ))}
          </div>

          {/* Sound Settings */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Sound</h3>
              <p className="text-sm text-gray-500">Play sound with notifications</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only"
                checked={settings.sound}
                onChange={(e) => setSettings({ ...settings, sound: e.target.checked })}
                disabled={!settings.enabled}
              />
              <div className={`w-11 h-6 rounded-full ${settings.enabled && settings.sound ? 'bg-blue-600' : 'bg-gray-200'} relative transition-colors`}>
                <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${settings.enabled && settings.sound ? 'translate-x-5' : 'translate-x-0.5'}`}></div>
              </div>
            </label>
          </div>

          {/* Duration Settings */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-2">Auto-hide Duration</h3>
            <div className="space-y-2">
              {[
                { value: 3000, label: '3 seconds' },
                { value: 5000, label: '5 seconds' },
                { value: 10000, label: '10 seconds' },
                { value: 0, label: 'Never auto-hide' },
              ].map(({ value, label }) => (
                <label key={value} className="flex items-center">
                  <input
                    type="radio"
                    name="duration"
                    value={value}
                    checked={settings.duration === value}
                    onChange={(e) => setSettings({ ...settings, duration: parseInt(e.target.value) })}
                    disabled={!settings.enabled}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <span className="ml-2 text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-8">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
