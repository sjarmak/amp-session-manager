import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import type { AmpTraceEvent } from '@ampsm/core';

interface TimelineItemProps {
  event: AmpTraceEvent;
  isLast: boolean;
}

function EventIcon({ type, status }: { type: AmpTraceEvent['type']; status: AmpTraceEvent['status'] }) {
  const getIconAndColor = () => {
    switch (type) {
      case 'agent':
        return { icon: '🤖', color: status === 'error' ? 'text-gruvbox-bright-red' : 'text-gruvbox-bright-blue' };
      case 'tool':
        return { icon: '🔧', color: status === 'error' ? 'text-gruvbox-bright-red' : 'text-gruvbox-bright-green' };
      case 'git':
        return { icon: '📝', color: status === 'error' ? 'text-gruvbox-bright-red' : 'text-gruvbox-bright-yellow' };
      case 'eval':
        return { icon: '📊', color: status === 'error' ? 'text-gruvbox-bright-red' : 'text-gruvbox-bright-aqua' };
      case 'workflow':
        return { icon: '⚡', color: status === 'error' ? 'text-gruvbox-bright-red' : 'text-gruvbox-bright-purple' };
      case 'ui':
        return { icon: '👤', color: 'text-gruvbox-fg2' };
      default:
        return { icon: '•', color: 'text-gruvbox-fg2' };
    }
  };

  const { icon, color } = getIconAndColor();

  return (
    <div className={`flex items-center justify-center w-8 h-8 rounded-full bg-gruvbox-bg2 border-2 border-gruvbox-bg3 ${color} text-lg`}>
      {icon}
    </div>
  );
}

function TimelineItem({ event, isLast }: TimelineItemProps) {
  const [expanded, setExpanded] = useState(false);
  
  const duration = event.tsEnd ? event.tsEnd - event.tsStart : 0;
  const isRunning = event.status === 'running';
  
  return (
    <div className="relative">
      {/* Connector Line */}
      {!isLast && (
        <div className="absolute left-4 top-8 w-0.5 h-16 bg-gruvbox-bg3"></div>
      )}
      
      {/* Event Content */}
      <div className="flex items-start space-x-4">
        <EventIcon type={event.type} status={event.status} />
        
        <div className="flex-1 min-w-0 pb-8">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gruvbox-fg0">{event.name}</h4>
              <p className="text-xs text-gruvbox-fg2 mt-1">
                {format(new Date(event.tsStart), 'HH:mm:ss')}
                {duration > 0 && ` • ${duration.toFixed(0)}ms`}
                {isRunning && ' • Running...'}
              </p>
            </div>
            
            {/* Status Badge */}
            <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
              event.status === 'success' ? 'bg-gruvbox-green/20 text-gruvbox-bright-green' :
              event.status === 'error' ? 'bg-gruvbox-red/20 text-gruvbox-bright-red' :
              event.status === 'running' ? 'bg-gruvbox-blue/20 text-gruvbox-bright-blue' :
              'bg-gruvbox-bg3 text-gruvbox-fg2'
            }`}>
              {event.status}
            </span>
          </div>
          
          {/* Cost and Token Information */}
          {(event.attrs.tokensIn || event.attrs.costUSD) && (
            <div className="mt-2 p-2 bg-gruvbox-bg2 rounded text-xs">
              {event.attrs.tokensIn && (
                <span className="text-gruvbox-fg2">
                  Tokens: {event.attrs.tokensIn.toLocaleString()} in, {(event.attrs.tokensOut || 0).toLocaleString()} out
                </span>
              )}
              {event.attrs.costUSD && (
                <span className="text-gruvbox-bright-yellow ml-2">
                  Cost: ${event.attrs.costUSD.toFixed(4)}
                </span>
              )}
              {event.attrs.model && (
                <span className="text-gruvbox-fg2 ml-2">
                  Model: {event.attrs.model}
                </span>
              )}
            </div>
          )}
          
          {/* Error Message */}
          {event.status === 'error' && event.errorMessage && (
            <div className="mt-2 p-2 bg-gruvbox-red/10 border border-gruvbox-red rounded text-xs">
              <div className="text-gruvbox-bright-red font-medium">Error</div>
              <div className="text-gruvbox-red mt-1">{event.errorMessage}</div>
            </div>
          )}
          
          {/* Additional Attributes */}
          {Object.keys(event.attrs).length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-gruvbox-bright-blue hover:text-gruvbox-blue cursor-pointer"
              >
                {expanded ? 'Hide' : 'Show'} Details
              </button>
              
              {expanded && (
                <div className="mt-2 p-2 bg-gruvbox-bg2 rounded text-xs">
                  <pre className="text-gruvbox-fg1 whitespace-pre-wrap">
                    {JSON.stringify(event.attrs, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface SessionTimelineProps {
  sessionId: string;
  className?: string;
}

export function SessionTimeline({ sessionId, className = '' }: SessionTimelineProps) {
  const [events, setEvents] = useState<AmpTraceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEvents();
    
    // Set up auto-refresh for running sessions
    const interval = setInterval(() => {
      const hasRunningEvents = events.some(e => e.status === 'running');
      if (hasRunningEvents) {
        loadEvents();
      }
    }, 2000);
    
    return () => clearInterval(interval);
  }, [sessionId]);

  const loadEvents = async () => {
    try {
      setError(null);
      const result = await window.electronAPI.sessions.getEvents(sessionId);
      
      if (result.success && result.events) {
        setEvents(result.events);
      } else {
        setError(result.error || 'Failed to load events');
      }
    } catch (error) {
      console.error('Failed to load session events:', error);
      setError(error instanceof Error ? error.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-start space-x-4">
              <div className="w-8 h-8 bg-gruvbox-bg2 rounded-full"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gruvbox-bg2 rounded w-1/3"></div>
                <div className="h-3 bg-gruvbox-bg2 rounded w-1/4"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="bg-gruvbox-red/20 border border-gruvbox-red rounded-lg p-4">
          <h3 className="text-gruvbox-bright-red font-medium">Error Loading Timeline</h3>
          <p className="text-gruvbox-red text-sm mt-1">{error}</p>
          <button
            onClick={loadEvents}
            className="mt-2 text-sm text-gruvbox-bright-red underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="text-center py-8">
          <div className="text-gruvbox-fg2 text-4xl mb-2">⏱️</div>
          <p className="text-gruvbox-fg2">No timeline events yet.</p>
          <p className="text-gruvbox-fg2 text-sm mt-1">Events will appear as the session runs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gruvbox-fg0">Session Timeline</h3>
        <div className="flex items-center gap-2 text-sm text-gruvbox-fg2">
          <span>{events.length} events</span>
          <button
            onClick={loadEvents}
            className="text-gruvbox-bright-blue hover:text-gruvbox-blue"
          >
            Refresh
          </button>
        </div>
      </div>
      
      <div className="space-y-0">
        {events.map((event, index) => (
          <TimelineItem
            key={event.id}
            event={event}
            isLast={index === events.length - 1}
          />
        ))}
      </div>
      
      {/* Timeline Footer */}
      <div className="mt-6 pt-4 border-t border-gruvbox-bg3">
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-gruvbox-bg2 border-2 border-gruvbox-bg3 flex items-center justify-center">
            <span className="text-gruvbox-fg2 text-xs">●</span>
          </div>
        </div>
        <p className="text-center text-xs text-gruvbox-fg2 mt-2">Session Start</p>
      </div>
    </div>
  );
}
