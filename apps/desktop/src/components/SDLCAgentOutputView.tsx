import React, { useState, useEffect } from 'react';

interface AgentStep {
  type: 'planning' | 'validation' | 'output' | 'model_change' | 'tool_execution';
  timestamp: string;
  model?: string;
  content: string;
  metadata?: any;
}

interface SDLCAgentOutputProps {
  toolCall: {
    id: string;
    name: string;
    input: any;
    result?: any;
    status?: 'pending' | 'success' | 'error';
    timestamp?: string;
  };
  className?: string;
  streamingEvents?: any[]; // Array of streaming events for this tool
}

export function SDLCAgentOutputView({ toolCall, streamingEvents = [], className = '' }: SDLCAgentOutputProps) {
  const [expanded, setExpanded] = useState(true); // Start expanded for SDLC agents to show thinking process
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [showValidation, setShowValidation] = useState(true); // Show validation by default for transparency
  
  const agentType = toolCall.name.replace('agent_', '');
  const agentIcon = {
    planning: 'Planning',
    testing: 'Testing', 
    devops: 'DevOps',
    compliance: 'Compliance',
    docs: 'Documentation',
    autonomy: 'Autonomy'
  }[agentType] || 'Agent';

  useEffect(() => {
    // Process streaming events to build agent steps timeline
    const steps: AgentStep[] = [];
    
    // Extract agent communication from streaming events
    streamingEvents.forEach(event => {
      if (event.type === 'model_change') {
        steps.push({
          type: 'model_change',
          timestamp: event.timestamp,
          model: event.data.model,
          content: `Model switched to ${event.data.model}`,
          metadata: event.data
        });
      }
      
      if (event.type === 'assistant_message') {
        // Check if this is validation output (alloy mode)
        if (event.data.content?.includes('Validation of the primary response')) {
          steps.push({
            type: 'validation',
            timestamp: event.timestamp,
            content: event.data.content,
            metadata: event.data
          });
        } else {
          steps.push({
            type: 'output',
            timestamp: event.timestamp,
            content: event.data.content,
            metadata: event.data
          });
        }
      }
      
      if (event.type === 'tool_start' || event.type === 'tool_finish') {
        steps.push({
          type: 'tool_execution',
          timestamp: event.timestamp,
          content: `${event.type === 'tool_start' ? 'Started' : 'Finished'} ${event.data.tool}`,
          metadata: event.data
        });
      }
    });

    setAgentSteps(steps);
  }, [streamingEvents]);

  // Parse agent result to extract validation sections
  const parseAgentResult = () => {
    if (!toolCall.result || typeof toolCall.result !== 'string') {
      console.log('No result or result is not string for agent:', toolCall.name, toolCall.result);
      return null;
    }
    
    const result = toolCall.result;
    console.log('Parsing result for agent:', toolCall.name, 'length:', result.length);
    
    // Extract sections from alloy mode output
    const sections = {
      primary: '',
      validation: '',
      improvements: '',
      final: ''
    };
    
    // Look for alloy mode structure with more flexible regex
    if (result.includes('Alloy Mode:') || result.includes('Validation of the primary response')) {
      console.log('Parsing alloy mode output for agent:', toolCall.name);
      console.log('📋 Sample of result text:', result.substring(0, 500) + '...');
      
      // Updated regex to match actual alloy mode format (with === or ─── separators)
      const validationMatch = result.match(/1\.\s*Validation of the primary response\s*\n[=─]{20,}\n\n?(.*?)(?=\n\n?[=─]{20,}|\n\s*\d+\.\s*[A-Z]|$)/s);
      if (validationMatch) {
        sections.validation = validationMatch[1].trim().replace(/^[=─]{20,}\s*/, '').replace(/[=─]{20,}\s*$/, '');
        console.log('✅ Extracted validation section:', sections.validation.substring(0, 100) + '...');
      } else {
        console.log('❌ Validation section not found');
      }
      
      const improvementsMatch = result.match(/\d+\.\s*Improvements.*?\n[=─]{20,}\n\n?(.*?)(?=\n\n?[=─]{20,}|\n\s*\d+\.\s*[A-Z]|$)/s);
      if (improvementsMatch) {
        sections.improvements = improvementsMatch[1].trim().replace(/^[=─]{20,}\s*/, '').replace(/[=─]{20,}\s*$/, '');
        console.log('✅ Extracted improvements section:', sections.improvements.substring(0, 100) + '...');
      } else {
        console.log('❌ Improvements section not found');
      }
      
      const finalMatch = result.match(/\d+\.\s*(?:Final recommended response|Recommended.*?response)\s*\n[=─]{20,}\n\n?(.*?)(?=\n---|\n<details>|$)/s);
      if (finalMatch) {
        sections.final = finalMatch[1].trim().replace(/^[=─]{20,}\s*/, '').replace(/[=─]{20,}\s*$/, '');
        console.log('✅ Extracted final section:', sections.final.substring(0, 100) + '...');
      } else {
        console.log('❌ Final section not found');
      }
      
      // If we didn't get final section, try alternative patterns
      if (!sections.final) {
        const altFinalMatch = result.match(/RECOMMENDED REPLY\s*\n\n?(.*?)(?=\n---|\n<details>|$)/s);
        if (altFinalMatch) {
          sections.final = altFinalMatch[1].trim();
          console.log('✅ Extracted final section (alt pattern):', sections.final.substring(0, 100) + '...');
        } else {
          console.log('❌ Alternative final section not found either');
        }
      }
    } else {
      sections.final = result;
    }
    
    return sections;
  };

  const sections = parseAgentResult();
  console.log('SDLCAgentOutputView - sections:', sections, 'showValidation:', showValidation);

  return (
    <div className={`border rounded-lg p-3 bg-gruvbox-aqua/20 border-gruvbox-aqua ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-lg">{agentIcon}</span>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold capitalize text-gruvbox-aqua">
                {agentType} Agent
              </span>
              {toolCall.timestamp && (
                <span className="text-xs text-gruvbox-fg2">
                  {new Date(toolCall.timestamp).toLocaleTimeString()}
                </span>
              )}
              {toolCall.status === 'pending' && (
                <div className="flex items-center gap-1">
                  <div className="animate-spin w-3 h-3 border border-gruvbox-aqua border-t-transparent rounded-full"></div>
                  <span className="text-xs text-gruvbox-aqua">Working...</span>
                </div>
              )}
            </div>
            
            <div className="text-sm text-gruvbox-fg1">
              <div className="font-medium mb-1">Task:</div>
              <div className="text-gruvbox-fg2 italic">
                {toolCall.input.task ? 
                  `${toolCall.input.task.slice(0, 150)}${toolCall.input.task.length > 150 ? '...' : ''}` : 
                  'SDLC agent task'
                }
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          {sections && (
            <button
              onClick={() => setShowValidation(!showValidation)}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                showValidation 
                  ? 'bg-gruvbox-purple/20 text-gruvbox-purple border-gruvbox-purple' 
                  : 'text-gruvbox-fg2 border-gruvbox-bg4 hover:border-gruvbox-fg2'
              }`}
            >
              {showValidation ? 'Hide Validation' : 'Show Validation'}
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gruvbox-fg2 hover:text-gruvbox-fg1 text-xs px-2 py-1 rounded border border-gruvbox-bg4 hover:border-gruvbox-fg2 transition-colors"
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>
      
      {/* Show working state when agent is pending */}
      {toolCall.status === 'pending' && (
        <div className="mt-3 pt-3 border-t border-gruvbox-bg4">
          <div className="bg-gruvbox-bg2 rounded-lg p-3 border-l-4 border-gruvbox-yellow">
            <div className="font-semibold text-gruvbox-yellow text-sm mb-2 flex items-center gap-2">
              <div className="animate-spin w-4 h-4 border border-gruvbox-yellow border-t-transparent rounded-full"></div>
              {agentType.charAt(0).toUpperCase() + agentType.slice(1)} Agent Thinking...
            </div>
            <div className="text-xs text-gruvbox-fg1 space-y-1">
              <div>Analyzing your request and project structure</div>
              <div>Running validation and improvement process</div>
              <div>Preparing comprehensive recommendations</div>
              {agentSteps.length > 0 && (
                <div className="mt-2 text-gruvbox-fg2">
                  Latest: {agentSteps[agentSteps.length - 1]?.content}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Agent validation sections (when available) */}
      {sections && showValidation && (sections.validation || sections.improvements || sections.final) && (
        <div className="mt-3 pt-3 border-t border-gruvbox-bg4 space-y-4">
          {sections.validation && (
            <div className="bg-gruvbox-bg2 rounded-lg p-3 border-l-4 border-gruvbox-purple">
              <div className="font-semibold text-gruvbox-purple text-sm mb-2 flex items-center gap-2">
              <span>Validation</span>
              Validation Process (Validator Model Analysis)
              </div>
              <div className="text-xs text-gruvbox-fg1 whitespace-pre-wrap leading-relaxed">
                {sections.validation}
              </div>
            </div>
          )}
          
          {sections.improvements && (
            <div className="bg-gruvbox-bg2 rounded-lg p-3 border-l-4 border-gruvbox-blue">
              <div className="font-semibold text-gruvbox-blue text-sm mb-2 flex items-center gap-2">
              <span>Insights</span>
              Improvements & Insights (Validator Recommendations)
              </div>
              <div className="text-xs text-gruvbox-fg1 whitespace-pre-wrap leading-relaxed">
                {sections.improvements}
              </div>
            </div>
          )}
          
          {sections.final && (
            <div className="bg-gruvbox-bg2 rounded-lg p-3 border-l-4 border-gruvbox-green">
              <div className="font-semibold text-gruvbox-green text-sm mb-2 flex items-center gap-2">
                <span>Final</span>
                Final Polished Output
              </div>
              <div className="text-xs text-gruvbox-fg1 whitespace-pre-wrap leading-relaxed">
                {sections.final}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Expanded view with timeline and detailed output */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-gruvbox-bg4 space-y-4">
          {/* Agent Communication Timeline */}
          {agentSteps.length > 0 && (
            <div>
              <div className="font-semibold text-gruvbox-fg0 text-sm mb-3 flex items-center gap-2">
                <span>Output</span>
              Agent Communication Timeline
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {agentSteps.map((step, idx) => (
                  <div key={idx} className="flex gap-3 text-xs">
                    <div className="text-gruvbox-fg2 font-mono w-16 flex-shrink-0">
                      {new Date(step.timestamp).toLocaleTimeString()}
                    </div>
                    <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
                      step.type === 'validation' ? 'bg-gruvbox-purple' :
                      step.type === 'model_change' ? 'bg-gruvbox-yellow' :
                      step.type === 'tool_execution' ? 'bg-gruvbox-orange' :
                      'bg-gruvbox-aqua'
                    }`}></div>
                    <div className="flex-1">
                      <div className={`font-medium ${
                        step.type === 'validation' ? 'text-gruvbox-purple' :
                        step.type === 'model_change' ? 'text-gruvbox-yellow' :
                        step.type === 'tool_execution' ? 'text-gruvbox-orange' :
                        'text-gruvbox-aqua'
                      }`}>
                        {step.type === 'validation' ? 'Validation' :
                         step.type === 'model_change' ? 'Model Change' :
                         step.type === 'tool_execution' ? 'Tool Execution' :
                         step.type === 'planning' ? 'Planning' :
                         'Output'}
                      </div>
                      <div className="text-gruvbox-fg1 mt-1 max-w-full overflow-hidden">
                        {step.content.length > 200 ? 
                          `${step.content.slice(0, 200)}...` : 
                          step.content
                        }
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Full Input Details */}
          <div>
            <div className="font-semibold text-gruvbox-fg0 text-sm mb-2 flex items-center gap-2">
               <span>Input</span>
            Full Task Input
            </div>
            <div className="bg-gruvbox-bg2 text-gruvbox-fg1 p-3 rounded text-sm leading-relaxed">
              <div className="space-y-2">
                <div>
                  <span className="font-medium text-gruvbox-fg0">Task:</span>
                  <div className="mt-1 whitespace-pre-wrap">{toolCall.input.task || 'No task specified'}</div>
                </div>
                
                {toolCall.input.context && (
                  <div>
                    <span className="font-medium text-gruvbox-fg0">Context:</span>
                    <div className="mt-1 whitespace-pre-wrap">{toolCall.input.context}</div>
                  </div>
                )}
                
                {Array.isArray(toolCall.input.files) && toolCall.input.files.length > 0 && (
                  <div>
                    <span className="font-medium text-gruvbox-fg0">Files:</span>
                    <div className="mt-1 font-mono text-xs text-gruvbox-fg2 space-y-1">
                      {toolCall.input.files.map((file: string, idx: number) => (
                        <div key={idx}>{file}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Fallback: show structured result if parsing failed but we have content */}
          {toolCall.result && sections && !sections.validation && !sections.improvements && !sections.final && (
            <div>
              <div className="font-semibold text-gruvbox-fg0 text-sm mb-2 flex items-center gap-2">
                <span>[OUT]</span>
                Agent Output (Structured view pending...)
              </div>
              <div className="bg-gruvbox-bg2 text-gruvbox-fg1 p-3 rounded overflow-auto text-sm max-h-96 leading-relaxed">
                <pre className="whitespace-pre-wrap">{
                  typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result, null, 2)
                }</pre>
              </div>
            </div>
          )}
          
          {/* Raw Result (if no structured sections) */}
          {toolCall.result && !sections && (
            <div>
              <div className="font-semibold text-gruvbox-fg0 text-sm mb-2 flex items-center gap-2">
                <span>[RAW]</span>
                Raw Output
              </div>
              <div className="bg-gruvbox-bg2 text-gruvbox-fg1 p-3 rounded overflow-auto text-sm max-h-96 leading-relaxed">
                <pre className="whitespace-pre-wrap">{
                  typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result, null, 2)
                }</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
