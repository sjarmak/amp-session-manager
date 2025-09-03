import React, { useState, useEffect } from "react";
import type { SessionCreateOptions } from "@ampsm/types";
import { isDev } from '../utils/isDev';

interface NewSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionCreated: (session?: any) => void;
}

export function NewSessionModal({
  isOpen,
  onClose,
  onSessionCreated,
}: NewSessionModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    ampPrompt: "",
    repoRoot: "",
    baseBranch: "main",
    scriptCommand: "",
    modelOverride: "",

  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ampMode, setAmpMode] = useState<'production' | 'local-cli'>('production');

  // Debug electronAPI availability
  useEffect(() => {
    console.log('NewSessionModal mounted, electronAPI available:', !!window.electronAPI);
    console.log('window.electronAPI:', window.electronAPI);
    console.log('window.electronAPI.sessions:', window.electronAPI?.sessions);
    console.log('window.electronAPI.sessions.create:', window.electronAPI?.sessions?.create);
  }, []);

  // Load amp settings when modal opens
  useEffect(() => {
    if (isOpen) {
      loadAmpSettings();
    }
  }, [isOpen]);

  const loadAmpSettings = async () => {
    try {
      const settings = await window.electronAPI.amp.getSettings();
      setAmpMode(settings.mode);
    } catch (error) {
      console.error('Failed to load Amp settings:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      ampPrompt: "",
      repoRoot: "",
      baseBranch: "main",
      scriptCommand: "",
      modelOverride: "",
    });
    setError(null);
    setCreating(false);
  };

  const handleClose = () => {
    if (!creating) {
      resetForm();
      onClose();
    }
  };

  const handleSelectDirectory = async () => {
    try {
      const result = await window.electronAPI.dialog.selectDirectory();
      if (!result.canceled && result.filePaths.length > 0) {
        setFormData((prev) => ({ ...prev, repoRoot: result.filePaths[0] }));
      }
    } catch (err) {
      console.error("Failed to select directory:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent multiple concurrent requests
    if (creating) {
      return;
    }

    // Only require name and repo directory for sessions
    const requiredFields = [
      formData.name.trim(),
      formData.repoRoot.trim()
    ];

    if (requiredFields.some(field => !field)) {
      setError("Please fill in all required fields");
      return;
    }

    setCreating(true);
    setError(null);

    const options: SessionCreateOptions = {
      name: formData.name.trim(),
      repoRoot: formData.repoRoot.trim(),
      baseBranch: formData.baseBranch.trim() || "main",
      modelOverride: formData.modelOverride.trim() || undefined,
      mode: 'interactive',

    };

    try {
      // Check if electronAPI is available
      if (!window.electronAPI || !window.electronAPI.sessions || !window.electronAPI.sessions.create) {
        console.error('electronAPI not available:', window.electronAPI);
        setError('Application not ready. Please wait and try again.');
        setCreating(false);
        return;
      }

      const result = await window.electronAPI.sessions.create(options);

      if (result.success) {
        // Close modal and reset form only after successful creation
        resetForm();
        onClose();

        // Refresh the session list and pass the created session
        onSessionCreated(result.session);
      } else {
        setError(result.error || "Failed to create session");
        setCreating(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-gruvbox-dark0/80 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget && !creating) {
          console.log("Backdrop clicked");
          handleClose();
        }
      }}
    >
      <div className="bg-gruvbox-dark1 rounded-lg shadow-2xl shadow-gruvbox-dark0/50 border border-gruvbox-light2/20 w-full max-w-md mx-4">
      <div className="flex items-center justify-between p-6 border-b border-gruvbox-light2/20">
      <h2 className="text-xl font-semibold text-gruvbox-light1">
      New Session
      </h2>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!creating) {
                console.log("Close button clicked");
                handleClose();
              }
            }}
            disabled={creating}
            className="text-gruvbox-light4 hover:text-gruvbox-light2 w-8 h-8 flex items-center justify-center hover:bg-gruvbox-light2/10 rounded transition-colors text-xl font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ zIndex: 9999, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-md text-orange-200 text-sm">
              {error}
            </div>
          )}



          <div>
            <label className="block text-sm font-medium text-gruvbox-light2 mb-1">
              Session Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              className="w-full px-3 py-2 bg-gruvbox-dark0 border border-gruvbox-light2/30 rounded-md text-gruvbox-light1 placeholder-gruvbox-light4 focus:outline-none focus:ring-2 focus:ring-gruvbox-aqua focus:border-gruvbox-aqua"
              placeholder="e.g., Add user authentication"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gruvbox-light2 mb-1">
              Repository Directory *
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formData.repoRoot}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, repoRoot: e.target.value }))
                }
                className="flex-1 px-3 py-2 bg-gruvbox-dark0 border border-gruvbox-light2/30 rounded-md text-gruvbox-light1 placeholder-gruvbox-light4 focus:outline-none focus:ring-2 focus:ring-gruvbox-aqua focus:border-gruvbox-aqua"
                placeholder="Path to git repository"
              />
              <button
                type="button"
                onClick={handleSelectDirectory}
                className="px-3 py-2 bg-gruvbox-light2/10 border border-gruvbox-light2/30 rounded-md text-gruvbox-light2 hover:bg-gruvbox-light2/20 hover:border-gruvbox-light3/40 transition-colors"
              >
                Browse
              </button>
            </div>
          </div>



          <div>
            <label className="block text-sm font-medium text-gruvbox-light2 mb-1">
              Base Branch
            </label>
            <input
              type="text"
              value={formData.baseBranch}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, baseBranch: e.target.value }))
              }
              className="w-full px-3 py-2 bg-gruvbox-dark0 border border-gruvbox-light2/30 rounded-md text-gruvbox-light1 placeholder-gruvbox-light4 focus:outline-none focus:ring-2 focus:ring-gruvbox-aqua focus:border-gruvbox-aqua"
              placeholder="main"
            />
          </div>





          <div>
            <label className="block text-sm font-medium text-gruvbox-light2 mb-1">
              Model Override (optional)
            </label>
            <select
              value={formData.modelOverride}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  modelOverride: e.target.value,
                }))
              }
              className="w-full px-3 py-2 bg-gruvbox-dark0 border border-gruvbox-dark3/50 rounded-md text-gruvbox-light1 focus:outline-none focus:ring-2 focus:ring-gruvbox-aqua focus:border-gruvbox-aqua"
            >
              <option value="" className="bg-gruvbox-dark0 text-gruvbox-light1">
                Default model
              </option>
              <option
                value="gpt-5"
                className="bg-gruvbox-dark0 text-gruvbox-light1"
              >
                GPT-5
              </option>
              <option
                value="alloy"
                className="bg-gruvbox-dark0 text-gruvbox-light1"
              >
                Alloy (GPT-5 + Sonnet 4)
              </option>
              {isDev && (
                <option
                  value="glm-4.5"
                  className="bg-gruvbox-dark0 text-gruvbox-light1"
                >
                  GLM 4.5 (dev only)
                </option>
              )}
            </select>
          </div>





          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={creating}
              className="flex-1 px-4 py-2 border border-gruvbox-dark3/50 text-gruvbox-light2 rounded-md hover:bg-gruvbox-dark2/20 hover:border-gruvbox-dark3/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="flex-1 px-4 py-2 bg-gruvbox-aqua text-gruvbox-dark0 rounded-md hover:bg-gruvbox-aqua disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {creating ? "Creating..." : "Create Session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
