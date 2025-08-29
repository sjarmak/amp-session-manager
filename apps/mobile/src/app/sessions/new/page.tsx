'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { Repository, Config, CreateSessionRequest } from '@/types/api';
import { RepoPicker } from '@/components/sessions/repo-picker';
import { toast } from '@/components/ui/toaster';
import { clsx } from 'clsx';

export const dynamic = 'force-dynamic';

type Step = 'repo' | 'config' | 'prompt';

interface FormData {
  repo?: Repository;
  config?: Config;
  name: string;
  prompt: string;
  baseBranch: string;
  scriptCommand: string;
  modelOverride: string;
  notes: string;
}

export default function NewSessionPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('repo');
  const [formData, setFormData] = useState<FormData>({
    name: '',
    prompt: '',
    baseBranch: 'main',
    scriptCommand: '',
    modelOverride: '',
    notes: '',
  });

  const { data: configsResponse } = useQuery({
    queryKey: ['configs'],
    queryFn: () => api.getConfigs(),
  });

  const configs = configsResponse?.data || [];

  const createSessionMutation = useMutation({
    mutationFn: (data: CreateSessionRequest) => api.createSession(data),
    onSuccess: (response) => {
      if (response.success) {
        toast({ 
          type: 'success',
          title: 'Session created',
          description: 'Your new session is ready to begin.' 
        });
        router.push(`/sessions/${response.data.id}`);
      } else {
        toast({ 
          type: 'error',
          title: 'Creation failed',
          description: response.error || 'Failed to create session' 
        });
      }
    },
    onError: (error) => {
      toast({ 
        type: 'error',
        title: 'Creation failed',
        description: error.message 
      });
    },
  });

  const handleNext = () => {
    if (step === 'repo' && formData.repo) {
      setStep('config');
    } else if (step === 'config') {
      setStep('prompt');
    }
  };

  const handleBack = () => {
    if (step === 'config') {
      setStep('repo');
    } else if (step === 'prompt') {
      setStep('config');
    } else {
      router.back();
    }
  };

  const handleSubmit = async () => {
    if (!formData.repo || !formData.prompt.trim()) return;

    const sessionData: CreateSessionRequest = {
      name: formData.name.trim() || `Session for ${formData.repo.name}`,
      ampPrompt: formData.prompt.trim(),
      repoRoot: formData.repo.path,
      baseBranch: formData.baseBranch.trim() || 'main',
      scriptCommand: formData.scriptCommand.trim() || undefined,
      modelOverride: formData.modelOverride.trim() || undefined,
      notes: formData.notes.trim() || undefined,
    };

    createSessionMutation.mutate(sessionData);
  };

  const applyConfig = (config: Config) => {
    setFormData(prev => ({
      ...prev,
      config,
      baseBranch: config.baseBranch,
      scriptCommand: config.scriptCommand || '',
      modelOverride: config.model !== 'default' ? config.model : '',
    }));
  };

  const isStepValid = (currentStep: Step) => {
    switch (currentStep) {
      case 'repo':
        return !!formData.repo;
      case 'config':
        return true; // Config step is always valid
      case 'prompt':
        return formData.prompt.trim().length > 0;
      default:
        return false;
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-card border-b border-border p-4 safe-area-top">
        <div className="flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center text-muted-foreground hover:text-foreground touch-target"
          >
            <ArrowLeft className="h-5 w-5 mr-1" />
            Back
          </button>
          <div className="flex items-center">
            <Zap className="h-5 w-5 text-primary mr-2" />
            <h1 className="text-lg font-semibold">New Session</h1>
          </div>
          <div className="w-16" /> {/* Spacer for centering */}
        </div>

        {/* Progress Steps */}
        <div className="flex items-center mt-4 space-x-2">
          {(['repo', 'config', 'prompt'] as const).map((stepName, index) => {
            const isActive = step === stepName;
            const isCompleted = (['repo', 'config', 'prompt'] as const).indexOf(step) > index;
            const isValid = isStepValid(stepName);

            return (
              <div key={stepName} className="flex items-center flex-1">
                <div
                  className={clsx(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium',
                    isCompleted
                      ? 'bg-primary text-primary-foreground'
                      : isActive && isValid
                      ? 'bg-primary text-primary-foreground'
                      : isActive
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <div
                  className={clsx(
                    'flex-1 h-0.5 ml-2',
                    index < 2 && (isCompleted || (isActive && isValid))
                      ? 'bg-primary'
                      : 'bg-border'
                  )}
                />
              </div>
            );
          })}
        </div>

        {/* Step Labels */}
        <div className="flex mt-2 text-xs">
          <div className="flex-1 text-center">Repository</div>
          <div className="flex-1 text-center">Configuration</div>
          <div className="flex-1 text-center">Prompt</div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 p-4 overflow-y-auto mobile-scroll">
        {step === 'repo' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-2">Select Repository</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Choose a local repository or clone one from GitHub.
              </p>
            </div>
            <RepoPicker
              onSelect={(repo) => setFormData(prev => ({ ...prev, repo }))}
              selectedRepo={formData.repo}
            />
          </div>
        )}

        {step === 'config' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-2">Configuration</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Set up your session configuration or choose from saved presets.
              </p>
            </div>

            {/* Saved Configurations */}
            {configs.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-medium text-foreground">Saved Configurations</h3>
                <div className="space-y-2">
                  {configs.map((config) => (
                    <button
                      key={config.id}
                      onClick={() => applyConfig(config)}
                      className={clsx(
                        'w-full text-left p-3 rounded-lg border transition-colors touch-target mobile-tap',
                        formData.config?.id === config.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-card hover:bg-muted/50'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{config.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {config.model} • {config.baseBranch}
                          </p>
                        </div>
                        {formData.config?.id === config.id && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Manual Configuration */}
            <div className="space-y-3">
              <h3 className="font-medium text-foreground">Manual Configuration</h3>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Base Branch
                </label>
                <input
                  type="text"
                  value={formData.baseBranch}
                  onChange={(e) => setFormData(prev => ({ ...prev, baseBranch: e.target.value }))}
                  placeholder="main"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground touch-target"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Test Command (Optional)
                </label>
                <input
                  type="text"
                  value={formData.scriptCommand}
                  onChange={(e) => setFormData(prev => ({ ...prev, scriptCommand: e.target.value }))}
                  placeholder="npm test"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground touch-target"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Model Override (Optional)
                </label>
                <input
                  type="text"
                  value={formData.modelOverride}
                  onChange={(e) => setFormData(prev => ({ ...prev, modelOverride: e.target.value }))}
                  placeholder="claude-3-5-sonnet"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground touch-target"
                />
              </div>
            </div>
          </div>
        )}

        {step === 'prompt' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-2">Session Prompt</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Describe what you want Amp to work on in this repository.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Session Name (Optional)
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder={`Session for ${formData.repo?.name || 'repository'}`}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground touch-target"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Prompt <span className="text-destructive">*</span>
              </label>
              <textarea
                value={formData.prompt}
                onChange={(e) => setFormData(prev => ({ ...prev, prompt: e.target.value }))}
                placeholder="Add user authentication to the application using JWT tokens..."
                rows={8}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground resize-none touch-target"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Be specific about what you want to implement, fix, or improve.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Notes (Optional)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional context or requirements..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground resize-none touch-target"
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border p-4 safe-area-bottom">
        {step === 'prompt' ? (
          <button
            onClick={handleSubmit}
            disabled={!isStepValid(step) || createSessionMutation.isPending}
            className="w-full bg-primary text-primary-foreground py-3 rounded-lg touch-target font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {createSessionMutation.isPending ? (
              <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full mr-2" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Create Session
          </button>
        ) : (
          <button
            onClick={handleNext}
            disabled={!isStepValid(step)}
            className="w-full bg-primary text-primary-foreground py-3 rounded-lg touch-target font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            Continue
            <ArrowRight className="h-4 w-4 ml-2" />
          </button>
        )}
      </div>
    </div>
  );
}
