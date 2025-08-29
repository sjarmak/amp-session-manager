import React from 'react';

interface AppHeaderProps {
  onSettingsClick: () => void;
}

export function AppHeader({ onSettingsClick }: AppHeaderProps) {
  return (
    <header className="text-center mb-8 relative app-header">
      <div className="flex items-center justify-center gap-2 mb-4">
        <img 
          src="/images/AmpRedSymbol.png" 
          alt="Amp Logo" 
          className="h-12 w-auto"
        />
        <h1 className="text-5xl font-bold text-gruvbox-light0">
          Amp Session Orchestrator
        </h1>
      </div>
      <p className="text-gruvbox-light3 font-header italic font-thin">
        Orchestrate parallel, multi-thread Amp sessions in isolated worktrees
      </p>
      
      {/* Settings Button */}
      <button
        onClick={onSettingsClick}
        className="absolute top-0 right-0 p-2 text-gruvbox-light3 hover:text-gruvbox-light1 transition-colors"
        title="Notification Settings"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </header>
  );
}
