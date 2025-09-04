import React, { useState } from 'react';
import { parse as parseYAML } from 'yaml';
import { BenchmarkStartOptions } from '../types/benchmark';

export interface NewBenchmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (options: BenchmarkStartOptions) => void;
}

export default function NewBenchmarkModal({ isOpen, onClose, onStart }: NewBenchmarkModalProps) {
  const [benchmarkType, setBenchmarkType] = useState<'swebench' | 'yaml'>('yaml');
  const [name, setName] = useState('');
  const [yamlConfigPath, setYamlConfigPath] = useState('');
  const [yamlContent, setYamlContent] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [casesDir, setCasesDir] = useState('');
  const [parallel, setParallel] = useState(1);
  const [maxIterations, setMaxIterations] = useState(10);
  const [timeoutSec, setTimeoutSec] = useState(300);
  const [models, setModels] = useState<string[]>([]);
  const [modelInput, setModelInput] = useState('');
  const [dryRun, setDryRun] = useState(false);

  if (!isOpen) return null;

  const saveYamlContent = async () => {
    if (yamlContent && yamlConfigPath && yamlContent.trim()) {
      try {
        const writeResult = await window.electronAPI.fs.writeFile(yamlConfigPath, yamlContent);
        if (!writeResult.success) {
          console.warn('Failed to save YAML changes:', writeResult.error);
        }
      } catch (error) {
        console.warn('Failed to save YAML changes:', error);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (benchmarkType === 'yaml' && validationErrors.length > 0) {
      alert('Please fix YAML validation errors before starting the benchmark.');
      return;
    }

    // Save any YAML edits before starting the benchmark
    if (benchmarkType === 'yaml') {
      await saveYamlContent();
    }
    
    const options: BenchmarkStartOptions = {
      type: benchmarkType,
      name: name || undefined,
      dryRun
    };

    if (benchmarkType === 'yaml') {
      options.yamlConfigPath = yamlConfigPath;
      options.models = models.length > 0 ? models : undefined;
    } else if (benchmarkType === 'swebench') {
      options.casesDir = casesDir;
      options.parallel = parallel;
      options.maxIterations = maxIterations;
      options.timeoutSec = timeoutSec;
    }

    onStart(options);
    onClose();
  };

  const handleAddModel = () => {
    if (modelInput.trim() && !models.includes(modelInput.trim())) {
      setModels([...models, modelInput.trim()]);
      setModelInput('');
    }
  };

  const handleRemoveModel = (model: string) => {
    setModels(models.filter(m => m !== model));
  };

  const validateYaml = (content: string) => {
    try {
      parseYAML(content);
      setValidationErrors([]);
      return true;
    } catch (error) {
      setValidationErrors([`YAML parsing error: ${error instanceof Error ? error.message : String(error)}`]);
      return false;
    }
  };

  const loadYamlContent = async (filePath: string) => {
    try {
      const fileReadResult = await window.electronAPI.fs.readFile(filePath);
      if (fileReadResult.success && fileReadResult.content) {
        setYamlContent(fileReadResult.content);
        validateYaml(fileReadResult.content);
      } else {
        alert(`Failed to read file: ${fileReadResult.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to load YAML file:', error);
      alert(`Failed to load file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const selectYamlFile = async () => {
    try {
      const result = await window.electronAPI.openFileDialog({
        title: 'Select Benchmark YAML File',
        filters: [
          { name: 'YAML Files', extensions: ['yaml', 'yml'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      
      if (result && !result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        setYamlConfigPath(filePath);
        await loadYamlContent(filePath);
      }
    } catch (error) {
      console.error('Failed to select file:', error);
    }
  };

  const selectCasesDir = async () => {
    try {
      const result = await window.electronAPI.openDirectoryDialog({
        title: 'Select SWE-bench Cases Directory'
      });
      
      if (result && !result.canceled && result.filePaths.length > 0) {
        setCasesDir(result.filePaths[0]);
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gruvbox-bg0 border border-gruvbox-bg3 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gruvbox-fg0">New Benchmark Run</h2>
          <button
            onClick={onClose}
            className="text-gruvbox-fg2 hover:text-gruvbox-fg0 text-xl"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Benchmark Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gruvbox-fg0 mb-2">
              Benchmark Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="yaml"
                  checked={benchmarkType === 'yaml'}
                  onChange={(e) => setBenchmarkType(e.target.value as 'yaml')}
                  className="mr-2"
                />
                <span className="text-gruvbox-fg1">YAML Benchmark (v2)</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="swebench"
                  checked={benchmarkType === 'swebench'}
                  onChange={(e) => setBenchmarkType(e.target.value as 'swebench')}
                  className="mr-2"
                />
                <span className="text-gruvbox-fg1">SWE-bench</span>
              </label>
            </div>
          </div>

          {/* Common Fields */}
          <div>
            <label className="block text-sm font-medium text-gruvbox-fg0 mb-2">
              Run Name (optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 bg-gruvbox-bg1 border border-gruvbox-bg3 rounded text-gruvbox-fg0 focus:border-gruvbox-bright-blue focus:outline-none"
              placeholder="e.g., Model Comparison Run"
            />
          </div>

          {/* YAML Benchmark Fields */}
          {benchmarkType === 'yaml' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gruvbox-fg0 mb-2">
                  YAML Config File *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={yamlConfigPath}
                    onChange={(e) => setYamlConfigPath(e.target.value)}
                    className="flex-1 p-2 bg-gruvbox-bg1 border border-gruvbox-bg3 rounded text-gruvbox-fg0 focus:border-gruvbox-bright-blue focus:outline-none"
                    placeholder="/path/to/benchmark.yaml"
                    required
                  />
                  <button
                    type="button"
                    onClick={selectYamlFile}
                    className="px-4 py-2 bg-gruvbox-bg2 border border-gruvbox-bg3 rounded text-gruvbox-fg1 hover:bg-gruvbox-bg3"
                  >
                    Browse
                  </button>
                  </div>
                  </div>

                  {/* YAML Preview */}
               {yamlConfigPath && (
                 <div>
                   <div className="flex justify-between items-center mb-2">
                     <label className="block text-sm font-medium text-gruvbox-fg0">
                       YAML Preview
                     </label>
                     <div className="text-xs text-gruvbox-fg2" title={yamlConfigPath}>
                       {yamlConfigPath.split('/').pop()}
                     </div>
                   </div>
                   
                   <textarea
                     value={yamlContent}
                     onChange={(e) => {
                       setYamlContent(e.target.value);
                       validateYaml(e.target.value);
                     }}
                     className="w-full h-64 px-3 py-2 bg-gruvbox-bg1 border border-gruvbox-bg3 text-gruvbox-fg0 rounded-lg font-mono text-sm focus:ring-2 focus:ring-gruvbox-blue focus:border-gruvbox-blue"
                     placeholder="YAML content will appear here..."
                   />
                   
                   {validationErrors.length > 0 && (
                     <div className="mt-2 p-3 bg-gruvbox-red/20 border border-gruvbox-red rounded-lg">
                       <h4 className="text-sm font-medium text-gruvbox-bright-red mb-1">Validation Errors:</h4>
                       <ul className="list-disc list-inside text-sm text-gruvbox-red space-y-1">
                         {validationErrors.map((error, index) => (
                           <li key={index}>{error}</li>
                         ))}
                       </ul>
                     </div>
                   )}
                 </div>
               )}

               <div>
                <label className="block text-sm font-medium text-gruvbox-fg0 mb-2">
                  Models (optional - leave empty to use all from spec)
                </label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={modelInput}
                      onChange={(e) => setModelInput(e.target.value)}
                      className="flex-1 p-2 bg-gruvbox-bg1 border border-gruvbox-bg3 rounded text-gruvbox-fg0 focus:border-gruvbox-bright-blue focus:outline-none"
                      placeholder="e.g., gpt-5, alloy"
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddModel())}
                    />
                    <button
                      type="button"
                      onClick={handleAddModel}
                      className="px-4 py-2 bg-gruvbox-bright-blue text-gruvbox-bg0 rounded hover:bg-gruvbox-blue"
                    >
                      Add
                    </button>
                  </div>
                  {models.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {models.map((model) => (
                        <span
                          key={model}
                          className="bg-gruvbox-bg2 text-gruvbox-fg1 px-2 py-1 rounded text-sm flex items-center gap-1"
                        >
                          {model}
                          <button
                            type="button"
                            onClick={() => handleRemoveModel(model)}
                            className="text-gruvbox-bright-red hover:text-gruvbox-red ml-1"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* SWE-bench Fields */}
          {benchmarkType === 'swebench' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gruvbox-fg0 mb-2">
                  Cases Directory *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={casesDir}
                    onChange={(e) => setCasesDir(e.target.value)}
                    className="flex-1 p-2 bg-gruvbox-bg1 border border-gruvbox-bg3 rounded text-gruvbox-fg0 focus:border-gruvbox-bright-blue focus:outline-none"
                    placeholder="/path/to/swebench/cases"
                    required
                  />
                  <button
                    type="button"
                    onClick={selectCasesDir}
                    className="px-4 py-2 bg-gruvbox-bg2 border border-gruvbox-bg3 rounded text-gruvbox-fg1 hover:bg-gruvbox-bg3"
                  >
                    Browse
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gruvbox-fg0 mb-2">
                    Parallel
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={parallel}
                    onChange={(e) => setParallel(parseInt(e.target.value))}
                    className="w-full p-2 bg-gruvbox-bg1 border border-gruvbox-bg3 rounded text-gruvbox-fg0 focus:border-gruvbox-bright-blue focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gruvbox-fg0 mb-2">
                    Max Iterations
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={maxIterations}
                    onChange={(e) => setMaxIterations(parseInt(e.target.value))}
                    className="w-full p-2 bg-gruvbox-bg1 border border-gruvbox-bg3 rounded text-gruvbox-fg0 focus:border-gruvbox-bright-blue focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gruvbox-fg0 mb-2">
                    Timeout (sec)
                  </label>
                  <input
                    type="number"
                    min="60"
                    max="3600"
                    value={timeoutSec}
                    onChange={(e) => setTimeoutSec(parseInt(e.target.value))}
                    className="w-full p-2 bg-gruvbox-bg1 border border-gruvbox-bg3 rounded text-gruvbox-fg0 focus:border-gruvbox-bright-blue focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          {/* Dry Run Option */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="dryRun"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="dryRun" className="text-sm text-gruvbox-fg1">
              Dry run (validate without executing)
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gruvbox-bg3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gruvbox-bg2 text-gruvbox-fg1 rounded hover:bg-gruvbox-bg3"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-gruvbox-bright-blue text-gruvbox-bg0 rounded hover:bg-gruvbox-blue"
            >
              {dryRun ? 'Validate' : 'Start Benchmark'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
