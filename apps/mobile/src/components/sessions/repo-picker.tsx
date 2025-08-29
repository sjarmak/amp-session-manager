'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Repository } from '@/types/api';
import { Folder, GitBranch, ExternalLink, Search, Github } from 'lucide-react';
import { clsx } from 'clsx';

interface RepoPickerProps {
  onSelect: (repo: Repository) => void;
  selectedRepo?: Repository;
}

export function RepoPicker({ onSelect, selectedRepo }: RepoPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [showGithubInput, setShowGithubInput] = useState(false);

  const { data: reposResponse, isLoading } = useQuery({
    queryKey: ['repositories'],
    queryFn: () => api.getRepositories(),
  });

  const repos = reposResponse?.data || [];
  
  const filteredRepos = repos.filter(repo =>
    repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    repo.path.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleGithubClone = async () => {
    if (!githubUrl.trim()) return;
    
    try {
      const response = await api.cloneRepository(githubUrl.trim());
      if (response.success && response.data) {
        onSelect(response.data);
        setGithubUrl('');
        setShowGithubInput(false);
      }
    } catch (error) {
      console.error('Failed to clone repository:', error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search repositories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground touch-target"
          />
        </div>

        {/* GitHub URL Input Toggle */}
        <button
          onClick={() => setShowGithubInput(!showGithubInput)}
          className="w-full flex items-center justify-center py-3 border border-border rounded-lg touch-target mobile-tap bg-muted/50 hover:bg-muted"
        >
          <Github className="h-4 w-4 mr-2" />
          <span className="text-sm font-medium">Clone from GitHub</span>
        </button>

        {/* GitHub URL Input */}
        {showGithubInput && (
          <div className="space-y-3 p-3 border border-border rounded-lg bg-muted/30">
            <input
              type="url"
              placeholder="https://github.com/username/repository"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              className="w-full px-3 py-2 rounded border border-border bg-background text-foreground placeholder:text-muted-foreground"
            />
            <div className="flex space-x-2">
              <button
                onClick={handleGithubClone}
                disabled={!githubUrl.trim()}
                className="flex-1 bg-primary text-primary-foreground py-2 rounded touch-target disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clone Repository
              </button>
              <button
                onClick={() => setShowGithubInput(false)}
                className="px-4 py-2 border border-border rounded touch-target bg-background"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Repository List */}
      <div className="space-y-2 max-h-96 overflow-y-auto mobile-scroll">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
            Loading repositories...
          </div>
        ) : filteredRepos.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Folder className="h-12 w-12 mx-auto mb-2" />
            <p>No repositories found</p>
            {searchTerm && (
              <p className="text-sm mt-1">Try a different search term</p>
            )}
          </div>
        ) : (
          filteredRepos.map((repo) => (
            <button
              key={repo.path}
              onClick={() => onSelect(repo)}
              className={clsx(
                'w-full text-left p-3 rounded-lg border transition-colors touch-target mobile-tap',
                selectedRepo?.path === repo.path
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:bg-muted/50'
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center mb-1">
                    <Folder className="h-4 w-4 mr-2 text-muted-foreground" />
                    <h3 className="font-medium text-foreground truncate">
                      {repo.name}
                    </h3>
                    {repo.hasRemote && (
                      <ExternalLink className="h-3 w-3 ml-1 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mb-2">
                    {repo.path}
                  </p>
                  {repo.isGitRepo && (
                    <div className="flex items-center text-xs text-muted-foreground">
                      <GitBranch className="h-3 w-3 mr-1" />
                      <span>{repo.branch}</span>
                      {repo.lastCommit && (
                        <>
                          <span className="mx-2">•</span>
                          <span className="truncate">
                            {repo.lastCommit.message.length > 40
                              ? repo.lastCommit.message.substring(0, 40) + '...'
                              : repo.lastCommit.message}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {selectedRepo?.path === repo.path && (
                  <div className="h-4 w-4 rounded-full bg-primary flex-shrink-0 ml-2" />
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
