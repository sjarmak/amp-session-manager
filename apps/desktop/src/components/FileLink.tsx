import React from 'react';

interface FileLinkProps {
  href: string;
  children: string;
  className?: string;
}

export function FileLink({ href, children, className = '' }: FileLinkProps) {
  // Extract filename from the href for display
  const pathWithoutProtocol = href.replace('file:///', '');
  const filename = pathWithoutProtocol.split('/').pop() || pathWithoutProtocol;
  
  // Use the children text if it's a simple filename, otherwise use extracted filename
  const displayName = children.includes('/') ? filename : children;
  
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.electronAPI?.openExternal?.(href);
  };

  return (
    <span 
      className={`inline-flex items-center bg-gruvbox-green/20 text-gruvbox-green px-2 py-1 rounded-md border border-gruvbox-green/40 hover:bg-gruvbox-green/30 cursor-pointer transition-colors text-xs font-medium ${className}`}
      onClick={handleClick}
      title={`Open: ${href.replace('file:///', '')}`}
    >
      <svg 
        className="w-3 h-3 mr-1.5 flex-shrink-0" 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2} 
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
        />
      </svg>
      {displayName}
    </span>
  );
}
