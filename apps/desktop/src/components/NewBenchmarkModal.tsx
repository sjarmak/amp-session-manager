import React, { useState } from 'react';

export interface NewBenchmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBenchmarkCreated: () => void;
}

export function NewBenchmarkModal({ isOpen, onClose, onBenchmarkCreated }: NewBenchmarkModalProps) {
  const [benchmarkType, setBenchmarkType] = useState<'swebench' | 'custom'>('swebench');
  const [casesDir, setCasesDir] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSelectDirectory = async () => {
    try {
      const result = await window.electronAPI.dialog.selectDirectory();
      if (!result.canceled && result.filePaths.length > 0) {
        setCasesDir(result.filePaths[0]);
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!casesDir.trim()) {
      alert('Please select a cases directory');
      return;
    }

    try {
      setLoading(true);
      
      const result = await window.electronAPI.benchmarks.start({
        type: benchmarkType,
        casesDir: casesDir.trim()
      });

      if (result.success) {
        onBenchmarkCreated();
        onClose();
        setCasesDir('');
        setBenchmarkType('swebench');
      } else {
        alert(`Failed to start benchmark: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to create benchmark:', error);
      alert('Failed to create benchmark. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-4">New Benchmark Run</h3>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Benchmark Type
            </label>
            <select
              value={benchmarkType}
              onChange={(e) => setBenchmarkType(e.target.value as 'swebench' | 'custom')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              disabled={loading}
            >
              <option value="swebench">SWE-bench</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cases Directory
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={casesDir}
                onChange={(e) => setCasesDir(e.target.value)}
                placeholder="Select directory containing benchmark cases"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={loading}
              />
              <button
                type="button"
                onClick={handleSelectDirectory}
                disabled={loading}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Browse
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !casesDir.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Starting...' : 'Start Benchmark'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
