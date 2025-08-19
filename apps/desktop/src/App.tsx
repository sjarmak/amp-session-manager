import React from 'react';
import { createRoot } from 'react-dom/client';
import './App.css';

function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto py-8 px-4">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Amp Session Manager
          </h1>
          <p className="text-gray-600">
            Manage isolated Git worktree sessions with Amp
          </p>
        </header>

        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Hello World! 🚀
          </h2>
          
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-md">
              <h3 className="font-semibold text-blue-800">Desktop App Ready</h3>
              <p className="text-blue-600 text-sm">
                Electron + React + TypeScript + Tailwind CSS
              </p>
            </div>
            
            <div className="bg-green-50 p-4 rounded-md">
              <h3 className="font-semibold text-green-800">Platform Info</h3>
              <p className="text-green-600 text-sm">
                Running on: {window.electronAPI?.platform || 'web'}
              </p>
              <p className="text-green-600 text-sm">
                Node.js: {window.electronAPI?.versions?.node || 'N/A'}
              </p>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-md">
              <h3 className="font-semibold text-purple-800">Next Steps</h3>
              <ul className="text-purple-600 text-sm space-y-1">
                <li>• Implement session list view</li>
                <li>• Add session creation form</li>
                <li>• Connect to core package</li>
                <li>• Add real-time notifications</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
