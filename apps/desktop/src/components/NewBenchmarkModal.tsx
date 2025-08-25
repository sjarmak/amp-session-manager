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
      <div className="bg-gruvbox-bg0 rounded-lg p-6 w-full max-w-md mx-4 border border-gruvbox-bg3">
        <h3 className="text-lg font-semibold mb-4 text-gruvbox-fg0">New Benchmark Run</h3>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gruvbox-fg1 mb-2">
              Benchmark Type
            </label>
            <select
              value={benchmarkType}
              onChange={(e) => setBenchmarkType(e.target.value as 'swebench' | 'custom')}
              className="w-full px-3 py-2 bg-gruvbox-bg1 border border-gruvbox-bg3 text-gruvbox-fg0 rounded-md focus:outline-none focus:ring-2 focus:ring-gruvbox-blue"
              disabled={loading}
            >
              <option value="swebench">SWE-bench</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gruvbox-fg1 mb-2">
              Cases Directory
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={casesDir}
                onChange={(e) => setCasesDir(e.target.value)}
                placeholder="Select directory containing benchmark cases"
                className="flex-1 px-3 py-2 bg-gruvbox-bg1 border border-gruvbox-bg3 text-gruvbox-fg0 rounded-md focus:outline-none focus:ring-2 focus:ring-gruvbox-blue placeholder-gruvbox-fg2"
                disabled={loading}
              />
              <button
                type="button"
                onClick={handleSelectDirectory}
                disabled={loading}
                className="px-4 py-2 bg-gruvbox-bg2 text-gruvbox-fg1 rounded-md hover:bg-gruvbox-bg3 transition-colors disabled:opacity-50"
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
              className="px-4 py-2 text-gruvbox-fg2 hover:text-gruvbox-fg0 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !casesDir.trim()}
              className="px-4 py-2 bg-gruvbox-blue text-gruvbox-bg0 rounded-lg hover:bg-gruvbox-bright-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Starting...' : 'Start Benchmark'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
