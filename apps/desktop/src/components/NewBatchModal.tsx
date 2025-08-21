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
    model: gpt-5  # Override default model for this item
    timeoutSec: 1200  # Override timeout for this item`;

export function NewBatchModal({ isOpen, onClose, onBatchCreated }: NewBatchModalProps) {
  const [planYaml, setPlanYaml] = useState(DEFAULT_PLAN);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
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
      
      const result = await window.electronAPI.batch.start({ planYaml });
      
      if (result.success) {
        onBatchCreated();
        onClose();
        // Reset form
        setPlanYaml(DEFAULT_PLAN);
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
      console.log('Opening file picker...');
      const result = await window.electronAPI.dialog.selectFile();
      console.log('File picker result:', result);
      
      if (!result.canceled && result.filePaths[0]) {
        const filePath = result.filePaths[0];
        console.log('Reading file:', filePath);
        const fileReadResult = await window.electronAPI.fs.readFile(filePath);
        console.log('File read result:', fileReadResult);
        
        if (fileReadResult.success && fileReadResult.content) {
          setPlanYaml(fileReadResult.content);
        } else {
          console.error('File read failed:', fileReadResult.error);
          alert(`Failed to read file: ${fileReadResult.error || 'Unknown error'}`);
        }
      } else if (result.canceled) {
        console.log('File picker was canceled');
      } else {
        console.log('No file selected');
      }
    } catch (error) {
      console.error('Failed to load plan file:', error);
      alert(`Failed to load file: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
          {/* Plan Editor */}
          <div>
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
