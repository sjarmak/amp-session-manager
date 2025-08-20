import React, { useState } from 'react';
import { parse as parseYAML } from 'yaml';

export interface NewBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBatchCreated: () => void;
}

const DEFAULT_PLAN = `runId: # Optional, will be auto-generated if not provided
concurrency: 3
defaults:
  baseBranch: main
  scriptCommand: # Optional test command, e.g., "pnpm test"
  model: # Optional default model
  jsonLogs: false
  timeoutSec: 900
  mergeOnPass: false
matrix:
  - repo: /path/to/repo1
    prompt: "Add comprehensive unit tests"
  - repo: /path/to/repo2
    prompt: "Implement error handling"
    model: gpt-4  # Override default model for this item
    timeoutSec: 1200  # Override timeout for this item`;

export function NewBatchModal({ isOpen, onClose, onBatchCreated }: NewBatchModalProps) {
  const [planYaml, setPlanYaml] = useState(DEFAULT_PLAN);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [overrides, setOverrides] = useState({
    concurrency: '',
    model: '',
    jsonLogs: false,
    timeoutSec: '',
    mergeOnPass: false
  });
  const [loading, setLoading] = useState(false);

  const validatePlan = () => {
    try {
      const parsed = parseYAML(planYaml);
      
      const errors: string[] = [];
      
      // Basic validation
      if (!parsed.concurrency || parsed.concurrency < 1) {
        errors.push('concurrency must be a positive number');
      }
      
      if (!parsed.defaults) {
        errors.push('defaults section is required');
      } else {
        if (!parsed.defaults.baseBranch) {
          errors.push('defaults.baseBranch is required');
        }
      }
      
      if (!parsed.matrix || !Array.isArray(parsed.matrix) || parsed.matrix.length === 0) {
        errors.push('matrix must be a non-empty array');
      } else {
        parsed.matrix.forEach((item: any, index: number) => {
          if (!item.repo) {
            errors.push(`matrix[${index}].repo is required`);
          }
          if (!item.prompt || item.prompt.trim().length === 0) {
            errors.push(`matrix[${index}].prompt is required and must not be empty`);
          }
        });
      }
      
      setValidationErrors(errors);
      return errors.length === 0;
    } catch (error) {
      setValidationErrors([`YAML parsing error: ${error instanceof Error ? error.message : String(error)}`]);
      return false;
    }
  };

  const handleDryRun = () => {
    if (validatePlan()) {
      alert('Plan validation passed! You can now start the batch.');
    }
  };

  const handleStart = async () => {
    if (!validatePlan()) {
      return;
    }

    try {
      setLoading(true);
      
      const startOptions = {
        planYaml,
        overrides: {
          ...(overrides.concurrency && { concurrency: parseInt(overrides.concurrency) }),
          ...(overrides.model && { model: overrides.model }),
          jsonLogs: overrides.jsonLogs,
          ...(overrides.timeoutSec && { timeoutSec: parseInt(overrides.timeoutSec) }),
          mergeOnPass: overrides.mergeOnPass
        }
      };

      const result = await window.electronAPI.batch.start(startOptions);
      
      if (result.success) {
        onBatchCreated();
        onClose();
        // Reset form
        setPlanYaml(DEFAULT_PLAN);
        setOverrides({
          concurrency: '',
          model: '',
          jsonLogs: false,
          timeoutSec: '',
          mergeOnPass: false
        });
      } else {
        alert(`Failed to start batch: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to start batch:', error);
      alert('Failed to start batch. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const loadPlanFile = async () => {
    try {
      const result = await window.electronAPI.dialog.selectDirectory();
      if (!result.canceled && result.filePaths[0]) {
        // In a real implementation, you'd have a file picker for YAML files
        // For now, show instructions
        alert('Select a YAML file and copy its contents into the editor below');
      }
    } catch (error) {
      console.error('Failed to load plan file:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">New Batch Run</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Plan Editor */}
            <div className="lg:col-span-2">
              <div className="flex justify-between items-center mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  Batch Plan (YAML)
                </label>
                <button
                  onClick={loadPlanFile}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Load from file
                </button>
              </div>
              
              <textarea
                value={planYaml}
                onChange={(e) => {
                  setPlanYaml(e.target.value);
                  setValidationErrors([]);
                }}
                className="w-full h-80 px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your batch plan in YAML format..."
              />
              
              {validationErrors.length > 0 && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <h4 className="text-sm font-medium text-red-800 mb-2">Validation Errors:</h4>
                  <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                    {validationErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Overrides */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Runtime Overrides</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Concurrency
                  </label>
                  <input
                    type="number"
                    value={overrides.concurrency}
                    onChange={(e) => setOverrides(prev => ({ ...prev, concurrency: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Override plan concurrency"
                    min="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Model
                  </label>
                  <input
                    type="text"
                    value={overrides.model}
                    onChange={(e) => setOverrides(prev => ({ ...prev, model: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Override default model"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Timeout (seconds)
                  </label>
                  <input
                    type="number"
                    value={overrides.timeoutSec}
                    onChange={(e) => setOverrides(prev => ({ ...prev, timeoutSec: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Override timeout"
                    min="1"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="jsonLogs"
                    checked={overrides.jsonLogs}
                    onChange={(e) => setOverrides(prev => ({ ...prev, jsonLogs: e.target.checked }))}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="jsonLogs" className="ml-2 block text-sm text-gray-900">
                    JSON Logs
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="mergeOnPass"
                    checked={overrides.mergeOnPass}
                    onChange={(e) => setOverrides(prev => ({ ...prev, mergeOnPass: e.target.checked }))}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="mergeOnPass" className="ml-2 block text-sm text-gray-900">
                    Auto-merge on pass
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center p-6 border-t border-gray-200">
          <button
            onClick={handleDryRun}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Validate Plan
          </button>
          
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleStart}
              disabled={loading || validationErrors.length > 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Starting...' : 'Start Batch'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
