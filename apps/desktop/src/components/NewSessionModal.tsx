import React, { useState, useEffect } from "react";
import type { SessionCreateOptions } from "@ampsm/types";

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
    // SDLC Agent fields
    agentId: "",
    autoRoute: false,
    alloyMode: false,
    multiProvider: false,
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
      // SDLC Agent fields
      agentId: "",
      autoRoute: false,
      alloyMode: false,
      multiProvider: false,
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
      // SDLC Agent options
      agentId: formData.agentId.trim() || undefined,
      agentMode: formData.agentId ? 'explicit' : 'auto',
      autoRoute: formData.autoRoute,
      alloyMode: formData.alloyMode,
      multiProvider: formData.multiProvider,
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



          {ampMode === 'local-cli' && (
            <div>
              <label className="block text-sm font-medium text-gruvbox-light2 mb-1">
                SDLC Agent (optional)
              </label>
              <div className="relative">
                <select
                  value={formData.agentId}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, agentId: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-gruvbox-dark0 border border-gruvbox-dark3/50 rounded-md text-gruvbox-light1 focus:outline-none focus:ring-2 focus:ring-gruvbox-aqua focus:border-gruvbox-aqua"
                >
                  <option value="" className="bg-gruvbox-dark0 text-gruvbox-light1">
                    Auto-detect from prompt
                  </option>
                  <option value="planning" className="bg-gruvbox-dark0 text-gruvbox-light1">
                    Planning - Architecture & Design
                  </option>
                  <option value="testing" className="bg-gruvbox-dark0 text-gruvbox-light1">
                    Testing - Quality Assurance
                  </option>
                  <option value="devops" className="bg-gruvbox-dark0 text-gruvbox-light1">
                    DevOps - Deployment & Infrastructure
                  </option>
                  <option value="compliance" className="bg-gruvbox-dark0 text-gruvbox-light1">
                    Compliance - Security & Audits
                  </option>
                  <option value="docs" className="bg-gruvbox-dark0 text-gruvbox-light1">
                    Documentation - Guides & API Docs
                  </option>
                  <option value="autonomy" className="bg-gruvbox-dark0 text-gruvbox-light1">
                    Autonomy - Task Breakdown
                  </option>
                </select>
                <div className="mt-2 text-xs text-gruvbox-light4 bg-gruvbox-dark0/50 p-2 rounded border border-gruvbox-dark3/30">
                  <div className="mb-1 font-medium">Auto-detection keywords:</div>
                  <div className="space-y-1">
                    <div><span className="text-gruvbox-light3">Planning:</span> plan, design, architect, specification, requirements</div>
                    <div><span className="text-gruvbox-light3">Testing:</span> test, unit test, qa, quality, coverage, validation</div>
                    <div><span className="text-gruvbox-light3">DevOps:</span> deploy, ci/cd, infrastructure, docker, pipeline, monitoring</div>
                    <div><span className="text-gruvbox-light3">Compliance:</span> security, compliance, audit, vulnerability</div>
                    <div><span className="text-gruvbox-light3">Documentation:</span> doc, readme, guide, manual, tutorial, example</div>
                    <div><span className="text-gruvbox-light3">Autonomy:</span> break down, subtask, workflow, orchestration</div>
                  </div>
                </div>
              </div>
            </div>
          )}

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
            </select>
          </div>

          {ampMode === 'local-cli' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gruvbox-light2">
                Advanced Options
              </label>
              <div className="space-y-2">
                <label className="flex items-center text-sm text-gruvbox-light3">
                  <input
                    type="checkbox"
                    checked={formData.autoRoute}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, autoRoute: e.target.checked }))
                    }
                    className="mr-2 rounded border-gruvbox-light2/30 bg-gruvbox-dark0 text-gruvbox-aqua focus:ring-gruvbox-aqua"
                  />
                  Enable Auto-routing (automatically select best agent)
                </label>
                <label className="flex items-center text-sm text-gruvbox-light3">
                  <input
                    type="checkbox"
                    checked={formData.alloyMode}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, alloyMode: e.target.checked }))
                    }
                    className="mr-2 rounded border-gruvbox-light2/30 bg-gruvbox-dark0 text-gruvbox-aqua focus:ring-gruvbox-aqua"
                  />
                  Enable Alloy Mode (primary + validator models)
                </label>
                <label className="flex items-center text-sm text-gruvbox-light3">
                  <input
                    type="checkbox"
                    checked={formData.multiProvider}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, multiProvider: e.target.checked }))
                    }
                    className="mr-2 rounded border-gruvbox-light2/30 bg-gruvbox-dark0 text-gruvbox-aqua focus:ring-gruvbox-aqua"
                  />
                  Enable Multi-provider Models
                </label>
              </div>
            </div>
          )}



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
