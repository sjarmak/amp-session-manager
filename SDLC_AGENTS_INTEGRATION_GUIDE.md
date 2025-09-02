# SDLC Agents Integration Guide for Amp Workflow Manager v2

This document provides comprehensive information for integrating the newly implemented SDLC Agent functionality from the main Amp repository into the Amp Workflow Manager v2 project.

## Overview

The main Amp repository now has 6 specialized SDLC agents with advanced features:

### ✅ **Implemented Features (Ready for Integration)**

1. **6 Specialized Agents**: planning, testing, devops, compliance, docs, autonomy
2. **Multi-Provider Model Support**: OpenAI, Anthropic, Google, DeepSeek models
3. **Alloy Mode**: Primary + validator model collaboration for enhanced quality
4. **Auto-Invocation**: Pattern-based routing that automatically selects the right agent
5. **Dynamic Enable/Disable**: Runtime control via settings.json configuration
6. **Server-Side Processing**: Full integration with Amp's backend infrastructure

### **Integration Target**

The **Amp Workflow Manager v2** project (`/Users/sjarmak/amp-workflow-manager-v2/`) needs to:
1. Support the new SDLC agents in session creation and execution
2. Enable agent selection in the UI (desktop app and CLI)
3. Provide agent-specific metrics and telemetry
4. Support the advanced agent features (multi-provider, alloy mode, auto-routing)

---

## SDLC Agents Reference

### **Agent Definitions**
Each agent has specific capabilities and auto-invocation patterns:

```typescript
const AGENTS = {
  planning: {
    id: 'planning',
    name: 'Planning Agent',
    description: 'System design, architecture planning, feature specification',
    primaryModel: 'gpt-5',
    validatorModel: 'o3',
    provider: 'openai',
    autoInvokePatterns: [
      /\bplan\b/i, /\bdesign\b/i, /\barchitect\b/i, /\bspecification\b/i,
      /\brequirements\b/i, /\bblueprint\b/i, /\bstrategy\b/i
    ]
  },
  testing: {
    id: 'testing',
    name: 'Testing Agent', 
    description: 'Test creation, quality assurance, test automation',
    primaryModel: 'gpt-5',
    validatorModel: 'claude-3-5-haiku-20241022',
    provider: 'openai',
    autoInvokePatterns: [
      /\btest\b/i, /\bunit test\b/i, /\bintegration test\b/i, /\bqa\b/i,
      /\bquality\b/i, /\bcoverage\b/i, /\bvalidation\b/i
    ]
  },
  devops: {
    id: 'devops',
    name: 'DevOps Agent',
    description: 'CI/CD, deployment, infrastructure, monitoring',
    primaryModel: 'gemini-2.0-flash-thinking-exp-1219',
    validatorModel: 'claude-3-5-sonnet-20241022',
    provider: 'google',
    autoInvokePatterns: [
      /\bdeploy\b/i, /\bci\/cd\b/i, /\binfrastructure\b/i, /\bkubernetes\b/i,
      /\bdocker\b/i, /\bpipeline\b/i, /\bmonitoring\b/i
    ]
  },
  compliance: {
    id: 'compliance',
    name: 'Compliance Agent',
    description: 'Security audits, compliance checks, vulnerability assessment',
    primaryModel: 'deepseek-r1',
    validatorModel: 'o3',
    provider: 'deepseek',
    autoInvokePatterns: [
      /\bsecurity\b/i, /\bcompliance\b/i, /\baudit\b/i, /\bvulnerabilit\b/i,
      /\bgdpr\b/i, /\bhipaa\b/i, /\bpci\b/i
    ]
  },
  docs: {
    id: 'docs',
    name: 'Documentation Agent',
    description: 'Documentation generation, API docs, user guides',
    primaryModel: 'claude-3-5-sonnet-20241022',
    validatorModel: 'gemini-2.0-flash-thinking-exp-1219',
    provider: 'anthropic',
    autoInvokePatterns: [
      /\bdoc\b/i, /\bapi doc\b/i, /\breadme\b/i, /\bguide\b/i,
      /\bmanual\b/i, /\btutorial\b/i, /\bexample\b/i
    ]
  },
  autonomy: {
    id: 'autonomy',
    name: 'Autonomy Agent',
    description: 'Task breakdown, autonomous execution, workflow orchestration',
    primaryModel: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    autoInvokePatterns: [
      /\bbreak.*down\b/i, /\bsubtask\b/i, /\bworkflow\b/i, /\borchestrat\b/i,
      /\bautomation\b/i, /\bsequence\b/i
    ]
  }
}
```

---

## Integration Points

### **1. Session Creation Enhancement**

**Current Workflow Manager Session Model:**
```typescript
interface Session {
  id: string;
  name: string;
  ampPrompt: string;
  // ... existing fields
  modelOverride?: string; // ← Extend this for agent support
}
```

**Required Enhancements:**
```typescript
interface Session {
  // ... existing fields
  agentId?: string;           // Selected SDLC agent
  agentMode?: 'explicit' | 'auto'; // How agent was selected
  multiProvider?: boolean;     // Enable multi-provider models
  alloyMode?: boolean;        // Enable primary + validator collaboration
  autoRoute?: boolean;        // Enable auto-invocation routing
}
```

### **2. Desktop App UI Extensions**

**Session Creation Modal - Add Agent Selection:**
```jsx
// In session creation form
<div className="agent-selection">
  <label>SDLC Agent (Optional)</label>
  <select value={agentId} onChange={setAgentId}>
    <option value="">Auto-detect from prompt</option>
    <option value="planning">🏗️ Planning - Architecture & Design</option>
    <option value="testing">🧪 Testing - Quality Assurance</option>
    <option value="devops">🚀 DevOps - Deployment & Infrastructure</option>
    <option value="compliance">🔒 Compliance - Security & Audits</option>
    <option value="docs">📚 Documentation - Guides & API Docs</option>
    <option value="autonomy">🤖 Autonomy - Task Breakdown</option>
  </select>
  
  <div className="advanced-options">
    <label>
      <input type="checkbox" checked={alloyMode} onChange={setAlloyMode} />
      Enable Alloy Mode (Primary + Validator models)
    </label>
  </div>
</div>
```

### **3. CLI Command Extensions**

**Existing CLI:**
```bash
amp-sessions new --repo ./my-project --name "test" --prompt "Hello"
```

**Enhanced CLI with Agent Support:**
```bash
# Explicit agent selection
amp-sessions new --repo ./my-project --name "test" \
  --prompt "Add unit tests" --agent testing

# Auto-routing mode  
amp-sessions new --repo ./my-project --name "test" \
  --prompt "Add unit tests" --auto-route

# Advanced features
amp-sessions new --repo ./my-project --name "test" \
  --prompt "Security audit" --agent compliance --alloy-mode
```

### **4. AmpAdapter Integration**

**Current AmpAdapter Configuration:**
```typescript
const runtimeConfig = {
  ampCliPath: '/Users/sjarmak/amp/cli/dist/main.js',
  ampServerUrl: 'https://localhost:7002'
};
```

**Enhanced for SDLC Agents:**
```typescript
interface AmpAdapterConfig {
  ampCliPath: string;
  ampServerUrl: string;
  // New agent-specific options
  agentId?: string;           // Specific agent to use
  autoRoute?: boolean;        // Enable auto-routing
  alloyMode?: boolean;        // Enable primary + validator
  multiProvider?: boolean;    // Enable multi-provider models
}

// Usage example
const adapter = new AmpAdapter({
  runtimeConfig: {
    ampCliPath: '/Users/sjarmak/amp/cli/dist/main.js',
    ampServerUrl: 'https://localhost:7002',
    agentId: 'testing',
    alloyMode: true
  },
  extraArgs: ['--agent', 'testing', '--alloy']  // CLI args
});
```

---

## Testing Infrastructure

### **Existing Test File**
The workflow manager already has `test-sdlc-agents.js` - this needs to be updated to use the new functionality:

**Current Test Issues:**
1. Hardcoded CLI path
2. Basic agent selection only  
3. No alloy mode testing
4. No auto-routing validation

**Required Test Enhancements:**
```javascript
// Enhanced test cases
const testCases = [
  // Auto-routing tests
  {
    name: 'Auto-route: Testing Agent',
    prompt: 'Add comprehensive unit tests for authentication',
    expectedAgent: 'testing',
    mode: 'auto-route'
  },
  {
    name: 'Auto-route: DevOps Agent', 
    prompt: 'Deploy to production with CI/CD pipeline',
    expectedAgent: 'devops',
    mode: 'auto-route'
  },
  
  // Explicit agent tests
  {
    name: 'Explicit: Compliance with Alloy',
    prompt: 'Review code for security vulnerabilities',
    agent: 'compliance',
    alloyMode: true,
    mode: 'explicit'
  },
  
  // Multi-provider tests
  {
    name: 'Multi-provider: Planning Agent',
    prompt: 'Design microservices architecture',
    agent: 'planning', 
    multiProvider: true,
    expectedModels: ['gpt-5', 'o3']
  }
];
```

---

## Required Code Changes

### **1. Core Package Extensions**

**File: `packages/core/src/amp-adapter.ts`**
```typescript
export interface AmpAdapterOptions {
  // ... existing options
  agentId?: string;
  autoRoute?: boolean;
  alloyMode?: boolean;
  multiProvider?: boolean;
}

export class AmpAdapter {
  async continueThread(prompt: string, workingDir: string, options?: {
    agentId?: string;
    autoRoute?: boolean;
    alloyMode?: boolean;
  }) {
    const args = [...this.extraArgs];
    
    // Add agent selection
    if (options?.agentId) {
      args.push('--agent', options.agentId);
    }
    
    // Add alloy mode
    if (options?.alloyMode) {
      args.push('--alloy');
    }
    
    // Add auto-routing
    if (options?.autoRoute) {
      args.push('--auto-route');
    }
    
    return this.executeCommand(prompt, workingDir, args);
  }
}
```

### **2. CLI Package Extensions**

**File: `packages/cli/src/commands/new.ts`**
```typescript
export const newCommand = new Command('new')
  .description('Create a new session')
  // ... existing options
  .option('--agent <agentId>', 'Specific SDLC agent to use')
  .option('--auto-route', 'Enable automatic agent routing')
  .option('--alloy-mode', 'Enable alloy mode (primary + validator)')
  .option('--multi-provider', 'Enable multi-provider model support')
  .action(async (options) => {
    // Create session with agent configuration
    const session = await sessionManager.createSession({
      // ... existing fields
      agentId: options.agent,
      agentMode: options.agent ? 'explicit' : 'auto',
      autoRoute: options.autoRoute,
      alloyMode: options.alloyMode,
      multiProvider: options.multiProvider
    });
  });
```

### **3. Desktop App Extensions**

**File: `apps/desktop/src/components/SessionCreationModal.tsx`**
```typescript
interface SessionCreationModalProps {
  // ... existing props
}

export const SessionCreationModal: React.FC<SessionCreationModalProps> = () => {
  const [agentId, setAgentId] = useState<string>('');
  const [alloyMode, setAlloyMode] = useState(false);
  const [autoRoute, setAutoRoute] = useState(true);
  
  // Agent options
  const agentOptions = [
    { id: '', name: 'Auto-detect from prompt', icon: '🤖' },
    { id: 'planning', name: 'Planning - Architecture & Design', icon: '🏗️' },
    { id: 'testing', name: 'Testing - Quality Assurance', icon: '🧪' },
    { id: 'devops', name: 'DevOps - Deployment & Infrastructure', icon: '🚀' },
    { id: 'compliance', name: 'Compliance - Security & Audits', icon: '🔒' },
    { id: 'docs', name: 'Documentation - Guides & API Docs', icon: '📚' },
    { id: 'autonomy', name: 'Autonomy - Task Breakdown', icon: '🤖' }
  ];
  
  return (
    <div className="session-creation-modal">
      {/* ... existing form fields */}
      
      <div className="agent-selection-section">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          SDLC Agent
        </label>
        <select 
          value={agentId} 
          onChange={(e) => setAgentId(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2"
        >
          {agentOptions.map(agent => (
            <option key={agent.id} value={agent.id}>
              {agent.icon} {agent.name}
            </option>
          ))}
        </select>
        
        <div className="advanced-options mt-4 space-y-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={alloyMode}
              onChange={(e) => setAlloyMode(e.target.checked)}
              className="mr-2"
            />
            Enable Alloy Mode (Primary + Validator models for higher quality)
          </label>
          
          <label className="flex items-center">
            <input
              type="checkbox" 
              checked={autoRoute}
              onChange={(e) => setAutoRoute(e.target.checked)}
              className="mr-2"
            />
            Enable Auto-routing (automatically select best agent from prompt)
          </label>
        </div>
      </div>
    </div>
  );
};
```

---

## Configuration and Settings

### **Required Settings Extension**

The workflow manager should support the same settings structure as the main Amp repository:

**File: `~/.ampsm/agent-config.json`**
```json
{
  "agents": {
    "enabled": true,
    "autoRoute": true,
    "agents": {
      "planning": { "enabled": true },
      "testing": { "enabled": true },
      "devops": { "enabled": true },
      "compliance": { "enabled": true },
      "docs": { "enabled": true },
      "autonomy": { "enabled": true }
    }
  }
}
```

### **Environment Variables**
```bash
# Point to local Amp development environment
export AMP_CLI_PATH="/Users/sjarmak/amp/cli/dist/main.js"
export AMP_SERVER_URL="https://localhost:7002"

# Enable SDLC agents
export AMP_AGENTS_ENABLED="true" 
export AMP_AUTO_ROUTE="true"
export AMP_ALLOY_MODE="true"
```

---

## Test Cases for Validation

### **1. Basic Agent Selection Test**
```javascript
// Test explicit agent selection
const session = await sessionManager.createSession({
  name: 'Testing Agent Test',
  prompt: 'Add unit tests for user authentication',
  agentId: 'testing',
  repo: './test-repo'
});

await sessionManager.iterate(session.id);
// Verify: Amp was called with --agent testing
```

### **2. Auto-routing Validation Test**
```javascript
const autoRouteTests = [
  { prompt: 'Add unit tests', expectedAgent: 'testing' },
  { prompt: 'Design microservices architecture', expectedAgent: 'planning' },
  { prompt: 'Deploy to production', expectedAgent: 'devops' },
  { prompt: 'Security audit needed', expectedAgent: 'compliance' },
  { prompt: 'Generate API documentation', expectedAgent: 'docs' },
  { prompt: 'Break down this complex task', expectedAgent: 'autonomy' }
];

for (const test of autoRouteTests) {
  const result = await ampAdapter.continueThread(test.prompt, './test-repo', {
    autoRoute: true
  });
  // Verify correct agent was selected
}
```

### **3. Alloy Mode Test**
```javascript
// Test alloy mode with primary + validator models
const session = await sessionManager.createSession({
  name: 'Alloy Mode Test',
  prompt: 'Review security vulnerabilities',
  agentId: 'compliance',
  alloyMode: true
});

await sessionManager.iterate(session.id);
// Verify: Both primary (deepseek-r1) and validator (o3) models were used
```

---

## Metrics and Telemetry Extensions

### **Enhanced Session Metrics**

The existing telemetry should be extended to capture agent-specific information:

```typescript
interface SessionTelemetry {
  // ... existing metrics
  agentMetrics: {
    agentId: string | null;           // Which agent was used
    agentMode: 'explicit' | 'auto';   // How agent was selected
    alloyMode: boolean;               // Whether alloy mode was used
    primaryModel: string | null;      // Primary model used
    validatorModel: string | null;    // Validator model (if alloy mode)
    autoRouted: boolean;              // Whether auto-routing occurred
    routingConfidence: number;        // Confidence score for auto-routing
  };
}
```

### **Agent Performance Dashboard**

Consider adding an agent-specific view in the desktop app:

```typescript
// Agent performance summary
interface AgentPerformanceData {
  agentId: string;
  sessionsCount: number;
  successRate: number;
  averageIterations: number;
  averageTokens: number;
  averageCost: number;
  commonPromptPatterns: string[];
}
```

---

## Development Server Connection

### **Local Development Setup**

The workflow manager is already configured to connect to local development environments. For SDLC agents testing:

```javascript
// Existing configuration in test-sdlc-agents.js
const runtimeConfig = {
  ampCliPath: '/Users/sjarmak/amp/cli/dist/main.js', 
  ampServerUrl: 'https://localhost:7002'
};

// This is correct - no changes needed here
// The SDLC agents will be available automatically once the main Amp server is running
```

### **Verification Commands**

```bash
# 1. Verify SDLC agents are registered
node -e "
const { AmpAdapter } = require('./packages/core/dist/index.js');
const adapter = new AmpAdapter({
  runtimeConfig: {
    ampCliPath: '/Users/sjarmak/amp/cli/dist/main.js'
  }
});
console.log('Testing agent availability...');
"

# 2. Test specific agent
echo 'Add unit tests' | node /Users/sjarmak/amp/cli/dist/main.js --agent testing -x

# 3. Test auto-routing  
echo 'Deploy to production' | node /Users/sjarmak/amp/cli/dist/main.js --auto-route -x
```

---

## Implementation Priority

### **Phase 1: Core Integration (High Priority)**
1. ✅ Update `AmpAdapter` to support agent options
2. ✅ Add agent selection to CLI commands
3. ✅ Update session model with agent fields
4. ✅ Basic UI for agent selection in desktop app

### **Phase 2: Advanced Features (Medium Priority)**  
1. ✅ Implement alloy mode support
2. ✅ Add auto-routing capability
3. ✅ Enhanced telemetry and metrics
4. ✅ Agent-specific performance tracking

### **Phase 3: Polish & Testing (Low Priority)**
1. ✅ Comprehensive test suite
2. ✅ Documentation and examples
3. ✅ Error handling and edge cases
4. ✅ Performance optimization

---

## Success Criteria

### **Integration Success Indicators:**

1. **Desktop App**: Agent selection dropdown works in session creation
2. **CLI**: `--agent`, `--auto-route`, `--alloy` flags work correctly  
3. **Auto-routing**: Prompts automatically select the right agent
4. **Alloy Mode**: Primary + validator models collaborate successfully
5. **Telemetry**: Agent usage metrics are captured and displayed
6. **Testing**: All existing workflow manager tests pass with agent support

### **Quality Gates:**
- All TypeScript compiles without errors
- Existing functionality remains intact
- New agent features work with both local and production Amp
- Test coverage includes agent-specific scenarios
- Documentation is updated with agent usage examples

---

## Resources and References

### **Main Repository Files (for reference):**
- `/Users/sjarmak/amp/core/src/agents/registry.ts` - Agent definitions
- `/Users/sjarmak/amp/core/src/agents/spawn.ts` - Multi-provider & alloy mode
- `/Users/sjarmak/amp/core/src/agents/routing.ts` - Auto-invocation logic
- `/Users/sjarmak/amp/core/src/tools/tools.ts` - Agent tool registration
- `/Users/sjarmak/amp/cli/src/main.ts` - CLI integration points

### **Test Files:**
- `/Users/sjarmak/amp/test-agents-simple.js` - Basic functionality test
- `/Users/sjarmak/amp/test-routing.mjs` - Auto-routing validation  
- `/Users/sjarmak/amp-workflow-manager-v2/test-sdlc-agents.js` - Existing test to enhance

### **Configuration:**
- `/Users/sjarmak/.config/amp/settings.json` - Agent enable/disable settings
- Server running at `https://localhost:7002` with database properly configured

---

## Ready to Integrate! 🚀

The SDLC agent infrastructure is fully implemented and tested in the main Amp repository. All core functionality works:

✅ **6 specialized agents** with distinct capabilities  
✅ **Multi-provider model support** (OpenAI, Anthropic, Google, DeepSeek)  
✅ **Alloy mode** for primary + validator collaboration  
✅ **Auto-invocation** with pattern-based routing  
✅ **Dynamic configuration** via settings.json  
✅ **Database connectivity** resolved  

The workflow manager integration is now ready to begin!
