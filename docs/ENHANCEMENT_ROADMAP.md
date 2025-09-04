# Amp Session Orchestrator Enhancement Roadmap

*Incorporating observability, workflow management, and collaboration features inspired by Mastra.ai and Gooey.ai*

## Overview

This document outlines a comprehensive enhancement plan for the Amp Session Orchestrator, focusing on observability, workflow automation, evaluation systems, and collaboration features. The plan prioritizes leveraging existing open-source tools and libraries to accelerate development.

## Core Architecture Enhancements

### 1. Telemetry & Observability System

#### Event Bus Architecture
We'll implement a centralized event system using **EventEmitter3** (lightweight, fast) or **mitt** (tiny event emitter).

```typescript
// packages/core/src/telemetry/events.ts
export interface AmpTraceEvent {
  id: string;                    // nanoid for unique span identification
  parentId?: string;            // for nested operations
  sessionId: string;            // link to session
  tsStart: number;              // performance.now()
  tsEnd?: number;
  type: 'agent' | 'tool' | 'git' | 'eval' | 'workflow' | 'ui';
  name: string;                 // e.g., 'openai:chat', 'git:commit', 'test:run'
  attrs: Record<string, any>;   // tokens, cost, model, exitCode, etc.
  status: 'running' | 'success' | 'error' | 'cancelled';
  errorMessage?: string;
  stackTrace?: string;
}

export interface CostMetrics {
  tokensIn: number;
  tokensOut: number;
  costUSD: number;
  model: string;
  provider: 'openai' | 'anthropic' | 'local';
}
```

**Open Source Dependencies:**
- **nanoid**: Unique ID generation
- **EventEmitter3**: High-performance event emitter
- **@opentelemetry/api**: Standard telemetry interfaces
- **better-sqlite3**: Already in use, extend for telemetry storage

#### Implementation Strategy

```typescript
// packages/core/src/telemetry/tracer.ts
import { EventEmitter } from 'eventemitter3';
import { nanoid } from 'nanoid';

export class AmpTracer extends EventEmitter {
  private activeSpans = new Map<string, AmpTraceEvent>();
  
  startSpan(name: string, type: AmpTraceEvent['type'], parentId?: string): string {
    const id = nanoid();
    const span: AmpTraceEvent = {
      id,
      parentId,
      sessionId: this.currentSessionId,
      tsStart: performance.now(),
      type,
      name,
      attrs: {},
      status: 'running'
    };
    
    this.activeSpans.set(id, span);
    this.emit('span:start', span);
    return id;
  }
  
  finishSpan(id: string, attrs?: Record<string, any>, error?: Error): void {
    const span = this.activeSpans.get(id);
    if (!span) return;
    
    span.tsEnd = performance.now();
    span.status = error ? 'error' : 'success';
    span.attrs = { ...span.attrs, ...attrs };
    
    if (error) {
      span.errorMessage = error.message;
      span.stackTrace = error.stack;
    }
    
    this.activeSpans.delete(id);
    this.emit('span:finish', span);
    
    // Persist to SQLite
    this.persistSpan(span);
  }
}
```

### 2. Cost & Performance Dashboard

#### Token Tracking Integration
Integrate with existing LLM providers using their native token counting:

```typescript
// packages/core/src/llm/providers/openai.ts
import OpenAI from 'openai';
import { tiktoken } from '@dqbd/tiktoken';

export class TrackedOpenAIProvider {
  private tracer: AmpTracer;
  private client: OpenAI;
  private encoder: tiktoken.Tiktoken;
  
  async chat(messages: OpenAI.ChatCompletionMessageParam[]): Promise<OpenAI.ChatCompletion> {
    const spanId = this.tracer.startSpan('openai:chat', 'agent');
    
    try {
      // Count input tokens
      const inputText = messages.map(m => m.content).join('');
      const tokensIn = this.encoder.encode(inputText).length;
      
      const completion = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages,
      });
      
      const tokensOut = completion.usage?.completion_tokens || 0;
      const costUSD = this.calculateCost('gpt-4', tokensIn, tokensOut);
      
      this.tracer.finishSpan(spanId, {
        tokensIn,
        tokensOut,
        costUSD,
        model: 'gpt-4',
        provider: 'openai'
      });
      
      return completion;
    } catch (error) {
      this.tracer.finishSpan(spanId, {}, error as Error);
      throw error;
    }
  }
}
```

**Open Source Dependencies:**
- **@dqbd/tiktoken**: Token counting for OpenAI models
- **recharts**: For cost/usage charts in React UI
- **date-fns**: Date manipulation for time-series data

#### UI Implementation
```typescript
// apps/desktop/src/components/analytics/CostDashboard.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

export function CostDashboard({ sessionId }: { sessionId: string }) {
  const { data: costData } = useCostMetrics(sessionId);
  const { data: tokenUsage } = useTokenUsage(sessionId);
  
  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard 
          title="Total Cost"
          value={`$${costData?.totalCost.toFixed(4) || '0'}`}
          trend={costData?.costTrend}
        />
        <MetricCard 
          title="Tokens Used"
          value={tokenUsage?.total?.toLocaleString() || '0'}
          trend={tokenUsage?.trend}
        />
        <MetricCard 
          title="Avg. Iteration Cost"
          value={`$${costData?.avgIterationCost.toFixed(4) || '0'}`}
        />
      </div>
      
      <LineChart width={800} height={300} data={costData?.timeSeries}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="timestamp" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="cost" stroke="#8884d8" />
      </LineChart>
    </div>
  );
}
```

### 3. Evaluation System

#### Custom Evaluation Framework
Build on **Vitest** for a familiar testing experience:

```typescript
// packages/core/src/evaluation/evaluator.ts
import { Worker } from 'worker_threads';
import { readFile } from 'fs/promises';

export interface EvalResult {
  id: string;
  name: string;
  score: number;        // 0-100
  passed: boolean;
  duration: number;
  details?: any;
  error?: string;
}

export interface EvalConfig {
  name: string;
  script: string;       // path to JS/TS file or inline code
  weight: number;       // for weighted scoring
  timeout: number;      // milliseconds
  required: boolean;    // blocks merge if fails
}

export class EvalRunner {
  async runEvaluation(
    config: EvalConfig, 
    context: EvalContext
  ): Promise<EvalResult> {
    const spanId = this.tracer.startSpan(`eval:${config.name}`, 'eval');
    
    try {
      // Run in isolated worker for security
      const worker = new Worker(
        `
        const { parentPort } = require('worker_threads');
        const evalFunction = ${await this.loadEvalScript(config.script)};
        
        evalFunction(${JSON.stringify(context)})
          .then(result => parentPort.postMessage({ success: true, result }))
          .catch(error => parentPort.postMessage({ success: false, error: error.message }));
        `,
        { eval: true, timeout: config.timeout }
      );
      
      const result = await new Promise<any>((resolve, reject) => {
        worker.on('message', resolve);
        worker.on('error', reject);
      });
      
      const evalResult: EvalResult = {
        id: nanoid(),
        name: config.name,
        score: result.result?.score || 0,
        passed: result.success && (result.result?.passed ?? false),
        duration: performance.now() - startTime,
        details: result.result?.details,
        error: result.error
      };
      
      this.tracer.finishSpan(spanId, { 
        score: evalResult.score,
        passed: evalResult.passed 
      });
      
      return evalResult;
    } catch (error) {
      this.tracer.finishSpan(spanId, {}, error as Error);
      throw error;
    }
  }
}
```

#### Built-in Evaluators
```typescript
// packages/core/src/evaluation/builtin/code-quality.ts
export async function codeQualityEval(context: EvalContext): Promise<EvalResult> {
  const { worktreePath, changedFiles } = context;
  
  // Use ESLint for linting score
  const { ESLint } = await import('eslint');
  const eslint = new ESLint();
  
  let totalErrors = 0;
  let totalWarnings = 0;
  
  for (const file of changedFiles.filter(f => f.endsWith('.ts') || f.endsWith('.js'))) {
    const results = await eslint.lintFiles([path.join(worktreePath, file)]);
    totalErrors += results.reduce((sum, r) => sum + r.errorCount, 0);
    totalWarnings += results.reduce((sum, r) => sum + r.warningCount, 0);
  }
  
  // Score: 100 for no issues, -5 per error, -1 per warning
  const score = Math.max(0, 100 - (totalErrors * 5) - totalWarnings);
  
  return {
    score,
    passed: totalErrors === 0,
    details: { errors: totalErrors, warnings: totalWarnings }
  };
}

// packages/core/src/evaluation/builtin/test-coverage.ts  
export async function testCoverageEval(context: EvalContext): Promise<EvalResult> {
  const { execSync } = await import('child_process');
  
  try {
    // Run tests with coverage (assuming Vitest)
    const output = execSync('pnpm test --coverage --reporter=json', { 
      cwd: context.worktreePath,
      encoding: 'utf8'
    });
    
    const coverage = JSON.parse(output);
    const linesCovered = coverage.total.lines.pct;
    
    return {
      score: linesCovered,
      passed: linesCovered >= context.config.minCoverage || 80,
      details: { 
        linesCovered,
        branchesCovered: coverage.total.branches.pct,
        functionsCovered: coverage.total.functions.pct
      }
    };
  } catch (error) {
    return {
      score: 0,
      passed: false,
      error: error.message
    };
  }
}
```

**Open Source Dependencies:**
- **eslint**: Code quality analysis
- **@vitest/coverage-v8**: Test coverage
- **jscpd**: Copy-paste detection
- **complexity-report**: Cyclomatic complexity

### 4. Visual Workflow System

#### Workflow Definition Schema
```typescript
// packages/types/src/workflow.ts
export interface WorkflowNode {
  id: string;
  type: 'start' | 'amp' | 'test' | 'eval' | 'approval' | 'parallel' | 'condition' | 'end';
  name: string;
  config: Record<string, any>;
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition?: string;  // JavaScript expression for conditional edges
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: Record<string, any>;
  created: string;
  updated: string;
}
```

#### React Flow Integration
Use **React Flow** for the visual workflow editor:

```typescript
// apps/desktop/src/components/workflow/WorkflowEditor.tsx
import ReactFlow, { 
  Node, 
  Edge, 
  addEdge, 
  useNodesState, 
  useEdgesState,
  Controls,
  Background,
  MiniMap
} from 'reactflow';

const nodeTypes = {
  amp: AmpNode,
  test: TestNode,
  eval: EvalNode,
  approval: ApprovalNode,
  parallel: ParallelNode
};

export function WorkflowEditor({ workflow }: { workflow?: WorkflowDefinition }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(workflow?.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(workflow?.edges || []);
  
  const onConnect = useCallback(
    (connection) => setEdges((edges) => addEdge(connection, edges)),
    [setEdges]
  );
  
  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Controls />
        <Background />
        <MiniMap />
      </ReactFlow>
      
      <WorkflowToolbar onAddNode={addNode} />
    </div>
  );
}
```

**Open Source Dependencies:**
- **reactflow**: Visual node-based editor
- **dagre**: Automatic graph layout
- **monaco-editor**: Code editing for conditions/scripts

#### Workflow Runtime Engine
```typescript
// packages/core/src/workflow/engine.ts
export class WorkflowEngine {
  private tracer: AmpTracer;
  private evaluator: EvalRunner;
  
  async executeWorkflow(
    definition: WorkflowDefinition,
    context: WorkflowContext
  ): Promise<WorkflowResult> {
    const spanId = this.tracer.startSpan(`workflow:${definition.name}`, 'workflow');
    
    try {
      const graph = this.buildExecutionGraph(definition);
      const state = new WorkflowState(context.variables);
      
      return await this.executeGraph(graph, state);
    } catch (error) {
      this.tracer.finishSpan(spanId, {}, error as Error);
      throw error;
    }
  }
  
  private async executeNode(
    node: WorkflowNode, 
    state: WorkflowState
  ): Promise<NodeResult> {
    switch (node.type) {
      case 'amp':
        return await this.executeAmpNode(node, state);
      case 'test':
        return await this.executeTestNode(node, state);
      case 'eval':
        return await this.executeEvalNode(node, state);
      case 'approval':
        return await this.executeApprovalNode(node, state);
      case 'parallel':
        return await this.executeParallelNode(node, state);
      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }
}
```

### 5. Session Timeline & Inspector

#### Timeline Visualization
```typescript
// apps/desktop/src/components/session/SessionTimeline.tsx
import { Timeline } from '@mantine/core';
import { format } from 'date-fns';

export function SessionTimeline({ sessionId }: { sessionId: string }) {
  const { data: events } = useSessionEvents(sessionId);
  const { data: costs } = useSessionCosts(sessionId);
  
  return (
    <div className="p-4">
      <Timeline active={events.length} bulletSize={24} lineWidth={2}>
        {events.map((event, index) => (
          <Timeline.Item
            key={event.id}
            bullet={<EventIcon type={event.type} />}
            title={event.name}
            className={event.status === 'error' ? 'text-red-500' : ''}
          >
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>{format(new Date(event.tsStart), 'HH:mm:ss')}</span>
                <span>{event.tsEnd ? `${event.tsEnd - event.tsStart}ms` : 'Running...'}</span>
              </div>
              
              {event.attrs.tokensIn && (
                <div className="text-xs bg-blue-50 p-2 rounded">
                  Tokens: {event.attrs.tokensIn} in, {event.attrs.tokensOut} out
                  {event.attrs.costUSD && ` ($${event.attrs.costUSD.toFixed(4)})`}
                </div>
              )}
              
              {event.status === 'error' && (
                <div className="text-xs bg-red-50 p-2 rounded text-red-700">
                  {event.errorMessage}
                </div>
              )}
              
              <EventDetails event={event} />
            </div>
          </Timeline.Item>
        ))}
      </Timeline>
    </div>
  );
}
```

### 6. Template Marketplace

#### Template Storage & Discovery
```typescript
// packages/core/src/templates/marketplace.ts
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  author: string;
  version: string;
  downloads: number;
  rating: number;
  definition: WorkflowDefinition;
  readme?: string;
  examples?: string[];
}

export class TemplateMarketplace {
  private githubRepo = 'amp-workflows/templates';
  
  async searchTemplates(query: string, tags?: string[]): Promise<WorkflowTemplate[]> {
    // Fetch from GitHub repo or CDN
    const response = await fetch(`https://api.github.com/repos/${this.githubRepo}/contents/templates`);
    const files = await response.json();
    
    const templates = await Promise.all(
      files.map(async (file) => {
        const content = await this.fetchTemplate(file.download_url);
        return JSON.parse(content) as WorkflowTemplate;
      })
    );
    
    return this.filterTemplates(templates, query, tags);
  }
  
  async installTemplate(templateId: string, targetPath: string): Promise<void> {
    const template = await this.getTemplate(templateId);
    await writeFile(
      path.join(targetPath, '.amp', 'workflows', `${template.name}.json`),
      JSON.stringify(template.definition, null, 2)
    );
  }
}
```

**Open Source Dependencies:**
- **octokit**: GitHub API client
- **fuse.js**: Fuzzy search for templates

## Implementation Timeline

### Phase 1: Foundation (Weeks 1-3)
- [ ] Implement telemetry event bus and tracer
- [ ] Add cost tracking to LLM providers
- [ ] Create basic analytics dashboard
- [ ] Implement built-in evaluators (linting, tests)

### Phase 2: Workflows (Weeks 4-6)
- [ ] Design workflow definition schema
- [ ] Build React Flow editor
- [ ] Implement workflow runtime engine
- [ ] Create approval/gate nodes

### Phase 3: Advanced Features (Weeks 7-10)
- [ ] Session timeline and inspector UI
- [ ] Template marketplace integration
- [ ] Advanced evaluations (coverage, complexity)
- [ ] Export to external observability tools

### Phase 4: Polish & Integration (Weeks 11-12)
- [ ] Performance optimization
- [ ] Documentation and examples
- [ ] CI/CD integration
- [ ] Security audit

## Technical Dependencies

### New Dependencies to Add

```json
{
  "dependencies": {
    "eventemitter3": "^4.0.7",
    "nanoid": "^4.0.0",
    "reactflow": "^11.0.0",
    "@dqbd/tiktoken": "^1.0.0",
    "recharts": "^2.8.0",
    "date-fns": "^2.30.0",
    "@mantine/core": "^7.0.0",
    "fuse.js": "^6.6.0",
    "octokit": "^3.0.0",
    "dagre": "^0.8.5"
  },
  "devDependencies": {
    "eslint": "^8.0.0",
    "@vitest/coverage-v8": "^1.0.0",
    "jscpd": "^3.5.0"
  }
}
```

### Database Schema Extensions

```sql
-- Telemetry events
CREATE TABLE telemetry_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  parent_id TEXT,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  ts_start INTEGER NOT NULL,
  ts_end INTEGER,
  status TEXT NOT NULL,
  attrs JSON,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions (id)
);

-- Evaluation results
CREATE TABLE eval_results (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  iteration_id TEXT,
  name TEXT NOT NULL,
  score REAL NOT NULL,
  passed BOOLEAN NOT NULL,
  duration INTEGER,
  details JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions (id)
);

-- Workflow definitions
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  definition JSON NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Workflow executions
CREATE TABLE workflow_executions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  session_id TEXT,
  status TEXT NOT NULL,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME,
  result JSON,
  FOREIGN KEY (workflow_id) REFERENCES workflows (id),
  FOREIGN KEY (session_id) REFERENCES sessions (id)
);
```

## Security Considerations

1. **Code Execution Sandboxing**: All custom evaluations run in Node.js Worker threads with limited permissions
2. **Template Validation**: Templates are validated against schema before installation
3. **Cost Limits**: Implement per-session cost limits to prevent runaway expenses
4. **Data Privacy**: Telemetry data stays local by default, with opt-in export

## Success Metrics

- **Developer Confidence**: Track session completion rates and user satisfaction
- **Cost Transparency**: Measure improvement in cost awareness and optimization
- **Workflow Adoption**: Monitor template usage and custom workflow creation
- **Quality Gates**: Track evaluation pass rates and their impact on code quality

This roadmap provides a clear path to transform the Amp Session Orchestrator into a comprehensive AI development platform while leveraging proven open-source tools and patterns.
