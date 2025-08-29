import React, { useState } from 'react';

export interface NewBenchmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBenchmarkCreated: () => void;
}

export function NewBenchmarkModal({ isOpen, onClose, onBenchmarkCreated }: NewBenchmarkModalProps) {
  const [benchmarkType, setBenchmarkType] = useState<'swebench' | 'custom' | 'yaml'>('swebench');
  const [casesDir, setCasesDir] = useState('');
  const [yamlConfigPath, setYamlConfigPath] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSelectDirectory = async () => {
    try {
      if (!window.electronAPI?.dialog?.selectDirectory) {
        alert('Directory selection not available');
        return;
      }
      const result = await window.electronAPI.dialog.selectDirectory();
      if (!result.canceled && result.filePaths.length > 0) {
        setCasesDir(result.filePaths[0]);
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
      alert('Failed to select directory');
    }
  };

  const handleSelectYamlFile = async () => {
    try {
      if (!window.electronAPI?.dialog?.selectFile) {
        alert('File selection not available');
        return;
      }
      const result = await window.electronAPI.dialog.selectFile();
      if (!result.canceled && result.filePaths.length > 0) {
        setYamlConfigPath(result.filePaths[0]);
      }
    } catch (error) {
      console.error('Failed to select file:', error);
      alert('Failed to select file');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (benchmarkType === 'yaml' && !yamlConfigPath.trim()) {
      alert('Please select a YAML config file');
      return;
    }
    
    if (benchmarkType !== 'yaml' && !casesDir.trim()) {
      alert('Please select a cases directory');
      return;
    }

    try {
      setLoading(true);
      
      if (!window.electronAPI?.benchmarks?.start) {
        alert('Benchmark API not available');
        return;
      }

      const result = await window.electronAPI.benchmarks.start({
        type: benchmarkType,
        casesDir: benchmarkType === 'yaml' ? undefined : casesDir.trim(),
        yamlConfigPath: benchmarkType === 'yaml' ? yamlConfigPath.trim() : undefined
      });

      if (result.success) {
        onBenchmarkCreated();
        onClose();
        setCasesDir('');
        setYamlConfigPath('');
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



  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={() => {
        if (!loading) {
          setCasesDir('');
          setBenchmarkType('swebench');
          onClose();
        }
      }}
    >
      <div 
        className="bg-gruvbox-bg0 rounded-lg p-6 w-full max-w-md mx-4 border border-gruvbox-bg3 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gruvbox-fg0">New Benchmark Run</h3>
          <button
            onClick={() => {
              setCasesDir('');
              setBenchmarkType('swebench');
              onClose();
            }}
            className="p-1 hover:bg-gruvbox-bg2 rounded transition-colors"
            title="Close"
          >
            <svg className="w-5 h-5 text-gruvbox-fg2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gruvbox-fg1 mb-2">
              Benchmark Type
            </label>
            <select
              value={benchmarkType}
              onChange={(e) => setBenchmarkType(e.target.value as 'swebench' | 'custom' | 'yaml')}
              className="w-full px-3 py-2 bg-gruvbox-bg1 border border-gruvbox-bg3 text-gruvbox-fg0 rounded-md focus:outline-none focus:ring-2 focus:ring-gruvbox-blue"
              disabled={loading}
            >
              <option value="swebench">SWE-bench</option>
              <option value="custom">Custom</option>
              <option value="yaml">YAML Config</option>
            </select>
          </div>

          {benchmarkType === 'yaml' ? (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gruvbox-fg1 mb-2">
                YAML Config File
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={yamlConfigPath}
                  onChange={(e) => setYamlConfigPath(e.target.value)}
                  placeholder="Select YAML benchmark configuration file"
                  className="flex-1 px-3 py-2 bg-gruvbox-bg1 border border-gruvbox-bg3 text-gruvbox-fg0 rounded-md focus:outline-none focus:ring-2 focus:ring-gruvbox-blue placeholder-gruvbox-fg2"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={handleSelectYamlFile}
                  disabled={loading}
                  className="px-4 py-2 bg-gruvbox-bg2 text-gruvbox-fg1 rounded-md hover:bg-gruvbox-bg3 transition-colors disabled:opacity-50"
                >
                  Browse
                </button>
              </div>
            </div>
          ) : (
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
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setCasesDir('');
                setYamlConfigPath('');
                setBenchmarkType('swebench');
                onClose();
              }}
              className="px-4 py-2 text-gruvbox-fg2 hover:text-gruvbox-fg0 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (benchmarkType === 'yaml' ? !yamlConfigPath.trim() : !casesDir.trim())}
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
