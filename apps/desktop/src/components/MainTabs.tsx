import React from 'react';
import type { View } from '../hooks/useNavigation';

interface MainTabsProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

export function MainTabs({ currentView, onViewChange }: MainTabsProps) {
  const tabs = [
    { id: 'sessions' as View, label: 'Sessions' },
    { id: 'batches' as View, label: 'Batches' },
    { id: 'benchmarks' as View, label: 'Benchmarks' },
  ];

  return (
    <div className="mb-6">
      <nav className="flex space-x-1 bg-gruvbox-dark1 p-1 rounded-lg border border-gruvbox-dark3">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onViewChange(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              currentView === tab.id 
                ? 'bg-gruvbox-aqua text-gruvbox-dark0 shadow-lg shadow-gruvbox-aqua/25' 
                : 'text-gruvbox-light3 hover:text-gruvbox-light1 hover:bg-gruvbox-aqua-dim/20'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
