# SDLC Agent Output Visibility Enhancement

This document describes the enhanced visibility features for SDLC agents in the Amp Session Orchestrator, allowing users to see the full validation process and model communication between agents.

## Overview

When SDLC agents are working (planning, testing, devops, compliance, docs, autonomy), users can now expand to see:

- ✅ **Full validation process** between primary and validator models
- ✅ **Agent communication timeline** with timestamps
- ✅ **Model switching events** during alloy mode operation
- ✅ **Tool execution details** with real-time status
- ✅ **Structured output sections** (validation, improvements, final output)

## Features

### 1. Enhanced SDLC Agent Tool Display

The `SDLCAgentOutputView` component provides rich visualization for SDLC agent tools:

- **Agent Type Icons**: Each agent type gets a unique emoji (📋 Planning, 🧪 Testing, etc.)
- **Status Indicators**: Real-time working status with animated spinners
- **Task Preview**: Shows the first 150 characters of the agent task
- **Expandable Details**: Click "Expand" to see full communication timeline

### 2. Validation Process Visibility

When agents run in alloy mode (primary + validator), the UI shows:

#### 🔍 Validation Process
- Shows the validator model's analysis of the primary response
- Highlights potential issues or improvements identified

#### 💡 Improvements & Insights  
- Displays additional insights from the validator model
- Shows suggestions for enhancing the primary response

#### ✅ Final Output
- Presents the polished, recommended response to the user
- Clean, structured output without internal validation details

### 3. Communication Timeline

The expanded view includes a timeline showing:

- **Model Changes**: When agents switch between different models
- **Tool Execution**: Start/finish events for internal tool usage
- **Validation Steps**: Real-time validation process events
- **Output Generation**: Assistant message events with timestamps

### 4. Streaming Events Integration

The system captures and displays:
- `tool_start` and `tool_finish` events
- `model_change` events during agent operation
- `assistant_message` events with structured content
- Real-time status updates and progress indicators

## Implementation Details

### Components

1. **SDLCAgentOutputView.tsx**: New enhanced UI component for SDLC agents
2. **ToolCallDisplay.tsx**: Updated to use enhanced view for agent tools
3. **InteractiveTab.tsx**: Modified to track and pass streaming events

### Key Features

#### Smart Output Parsing
```typescript
// Extracts structured sections from agent output
const sections = {
  validation: '',    // Validator model's analysis
  improvements: '', // Additional insights
  final: ''        // Polished final response
};
```

#### Timeline Visualization
```typescript
// Displays chronological communication events
interface AgentStep {
  type: 'planning' | 'validation' | 'output' | 'model_change' | 'tool_execution';
  timestamp: string;
  model?: string;
  content: string;
  metadata?: any;
}
```

#### Streaming Event Tracking
```typescript
// Captures all streaming events for agent analysis
const [streamingEvents, setStreamingEvents] = useState<any[]>([]);
```

## Usage

### For Users

1. **Basic View**: Agent tools show task summary and status
2. **Validation Toggle**: Click "Show/Hide Validation" to see validation process
3. **Expand Details**: Click "Expand" to see full timeline and communication
4. **Real-time Updates**: Watch agent progress with live status indicators

### For Developers

The enhanced output view is automatically used for these agent tools:
- `agent_planning`
- `agent_testing` 
- `agent_devops`
- `agent_compliance`
- `agent_docs`
- `agent_autonomy`

Regular tools continue to use the standard `ToolCallDisplay`.

## Benefits

1. **Transparency**: Users can see exactly how agents validate and improve their work
2. **Trust**: Visibility into the validation process builds confidence in agent outputs
3. **Learning**: Users can understand agent reasoning and validation patterns
4. **Debugging**: Developers can trace agent communication for troubleshooting
5. **Progress Tracking**: Real-time status helps users understand agent progress

## Configuration

No additional configuration required. The enhanced view automatically:
- Detects SDLC agent tools
- Captures relevant streaming events
- Parses agent output for structured display
- Provides appropriate UI controls

## Future Enhancements

Potential improvements could include:
- Export agent communication logs
- Filter timeline by event type
- Search within agent output
- Performance metrics visualization
- Agent interaction diagrams
