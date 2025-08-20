import React from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';

interface DiffViewerProps {
  diff: string;
  fileName?: string;
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
}

function parseDiff(diffText: string) {
  const sections: Array<{
    fileName: string;
    oldContent: string;
    newContent: string;
  }> = [];
  
  if (!diffText || diffText.trim() === 'No changes found') {
    return sections;
  }
  
  const lines = diffText.split('\n');
  let currentFile = '';
  let currentOldContent = '';
  let currentNewContent = '';
  let inFile = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Git diff header (e.g., "diff --git a/file.txt b/file.txt")
    if (line.startsWith('diff --git')) {
      // Save previous file if exists
      if (inFile && currentFile) {
        sections.push({
          fileName: currentFile,
          oldContent: currentOldContent.slice(0, -1), // Remove trailing newline
          newContent: currentNewContent.slice(0, -1)
        });
      }
      
      // Extract filename from "diff --git a/path/to/file b/path/to/file"
      const match = line.match(/diff --git a\/(.+) b\/(.+)/);
      currentFile = match ? match[2] : 'unknown';
      currentOldContent = '';
      currentNewContent = '';
      inFile = true;
      continue;
    }
    
    // Skip other headers
    if (line.startsWith('index ') || line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++')) {
      continue;
    }
    
    if (inFile) {
      if (line.startsWith('-') && !line.startsWith('---')) {
        // Removed line (old content)
        currentOldContent += line.substring(1) + '\n';
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        // Added line (new content)
        currentNewContent += line.substring(1) + '\n';
      } else {
        // Context line (appears in both old and new)
        const contextLine = line.startsWith(' ') ? line.substring(1) : line;
        currentOldContent += contextLine + '\n';
        currentNewContent += contextLine + '\n';
      }
    }
  }
  
  // Save last file
  if (inFile && currentFile) {
    sections.push({
      fileName: currentFile,
      oldContent: currentOldContent.slice(0, -1),
      newContent: currentNewContent.slice(0, -1)
    });
  }
  
  return sections;
}

export function DiffViewer({ diff, fileName, loading, error, onRefresh }: DiffViewerProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-500">Loading diff...</div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <div className="flex items-center justify-between">
          <div className="text-red-800">Error loading diff: {error}</div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="text-sm text-red-600 underline hover:no-underline"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }
  
  if (!diff || diff.trim() === 'No changes found' || diff.trim() === '') {
    return (
      <div className="p-8 text-gray-600 text-center bg-gray-50 rounded-lg">
        No changes found in this session
      </div>
    );
  }
  
  const sections = parseDiff(diff);
  
  if (sections.length === 0) {
    // Fallback to raw diff display if parsing fails
    return (
      <div className="bg-gray-900 rounded-lg overflow-hidden">
        <pre className="p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap text-green-400">
          {diff}
        </pre>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {sections.map((section, index) => (
        <div key={index} className="border rounded-lg overflow-hidden">
          <div className="bg-gray-100 px-4 py-2 border-b">
            <h4 className="text-sm font-mono text-gray-800">{section.fileName}</h4>
          </div>
          <div className="overflow-x-auto">
            <ReactDiffViewer
              oldValue={section.oldContent}
              newValue={section.newContent}
              splitView={true}
              compareMethod={DiffMethod.WORDS}
              hideLineNumbers={false}
              styles={{
                variables: {
                  dark: {
                    diffViewerBackground: '#ffffff',
                    diffViewerColor: '#212529',
                    addedBackground: '#e6ffed',
                    addedColor: '#24292e',
                    removedBackground: '#ffeef0',
                    removedColor: '#24292e',
                    wordAddedBackground: '#acf2bd',
                    wordRemovedBackground: '#fbb6c0',
                    addedGutterBackground: '#cdffd8',
                    removedGutterBackground: '#fdbbc5',
                    gutterBackground: '#f7f7f7',
                    gutterBackgroundDark: '#f7f7f7',
                    highlightBackground: '#fffbdd',
                    highlightGutterBackground: '#fff5b4',
                  },
                },
                diffContainer: {
                  fontSize: '13px',
                },
                line: {
                  fontSize: '13px',
                },
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
