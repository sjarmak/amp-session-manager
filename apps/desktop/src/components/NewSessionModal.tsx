import React, { useState } from 'react';
import type { SessionCreateOptions } from '@ampsm/types';

interface NewSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionCreated: () => void;
}

export function NewSessionModal({ isOpen, onClose, onSessionCreated }: NewSessionModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    ampPrompt: '',
    repoRoot: '',
    baseBranch: 'main',
    scriptCommand: '',
    modelOverride: ''
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectDirectory = async () => {
    try {
      const result = await window.electronAPI.dialog.selectDirectory();
      if (!result.canceled && result.filePaths.length > 0) {
        setFormData(prev => ({ ...prev, repoRoot: result.filePaths[0] }));
      }
    } catch (err) {
      console.error('Failed to select directory:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.ampPrompt.trim() || !formData.repoRoot.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const options: SessionCreateOptions = {
        name: formData.name.trim(),
        ampPrompt: formData.ampPrompt.trim(),
        repoRoot: formData.repoRoot.trim(),
        baseBranch: formData.baseBranch.trim() || 'main',
        scriptCommand: formData.scriptCommand.trim() || undefined,
        modelOverride: formData.modelOverride.trim() || undefined
      };

      const result = await window.electronAPI.sessions.create(options);
      
      if (result.success) {
        onSessionCreated();
        onClose();
        // Reset form
        setFormData({
          name: '',
          ampPrompt: '',
          repoRoot: '',
          baseBranch: 'main',
          scriptCommand: '',
          modelOverride: ''
        });
      } else {
        setError(result.error || 'Failed to create session');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">New Session</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Session Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Add user authentication"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Repository Directory *
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formData.repoRoot}
                onChange={(e) => setFormData(prev => ({ ...prev, repoRoot: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Path to git repository"
              />
              <button
                type="button"
                onClick={handleSelectDirectory}
                className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              >
                Browse
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amp Prompt *
            </label>
            <textarea
              value={formData.ampPrompt}
              onChange={(e) => setFormData(prev => ({ ...prev, ampPrompt: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Describe what you want Amp to implement..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Base Branch
            </label>
            <input
              type="text"
              value={formData.baseBranch}
              onChange={(e) => setFormData(prev => ({ ...prev, baseBranch: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="main"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Test Script (optional)
            </label>
            <input
              type="text"
              value={formData.scriptCommand}
              onChange={(e) => setFormData(prev => ({ ...prev, scriptCommand: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., pnpm test"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Model Override (optional)
            </label>
            <input
              type="text"
              value={formData.modelOverride}
              onChange={(e) => setFormData(prev => ({ ...prev, modelOverride: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., gpt-4"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating...' : 'Create Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
