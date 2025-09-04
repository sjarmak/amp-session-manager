import { EventEmitter } from 'eventemitter3';
import { nanoid } from 'nanoid';
import type { AmpTraceEvent, SessionMetrics } from './events.js';

export class AmpTracer extends EventEmitter {
  private activeSpans = new Map<string, AmpTraceEvent>();
  private currentSessionId: string = '';
  
  constructor(sessionId?: string) {
    super();
    if (sessionId) {
      this.setCurrentSession(sessionId);
    }
  }
  
  setCurrentSession(sessionId: string): void {
    this.currentSessionId = sessionId;
  }
  
  startSpan(
    name: string, 
    type: AmpTraceEvent['type'], 
    parentId?: string,
    attrs: Record<string, any> = {}
  ): string {
    const id = nanoid();
    const span: AmpTraceEvent = {
      id,
      parentId,
      sessionId: this.currentSessionId,
      tsStart: performance.now(),
      type,
      name,
      attrs,
      status: 'running'
    };
    
    this.activeSpans.set(id, span);
    this.emit('span:start', span);
    return id;
  }
  
  finishSpan(
    id: string, 
    attrs?: Record<string, any>, 
    error?: Error
  ): AmpTraceEvent | null {
    const span = this.activeSpans.get(id);
    if (!span) {
      console.warn(`Attempted to finish unknown span: ${id}`);
      return null;
    }
    
    span.tsEnd = performance.now();
    span.status = error ? 'error' : 'success';
    span.attrs = { ...span.attrs, ...attrs };
    
    if (error) {
      span.errorMessage = error.message;
      span.stackTrace = error.stack;
    }
    
    this.activeSpans.delete(id);
    this.emit('span:finish', span);
    
    return span;
  }
  
  addEvent(
    spanId: string,
    name: string,
    attrs?: Record<string, any>
  ): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;
    
    if (!span.attrs.events) {
      span.attrs.events = [];
    }
    
    span.attrs.events.push({
      timestamp: performance.now(),
      name,
      attrs
    });
    
    this.emit('span:event', { spanId, name, attrs });
  }
  
  cancelSpan(id: string): void {
    const span = this.activeSpans.get(id);
    if (!span) return;
    
    span.tsEnd = performance.now();
    span.status = 'cancelled';
    
    this.activeSpans.delete(id);
    this.emit('span:finish', span);
  }
  
  getActiveSpans(): AmpTraceEvent[] {
    return Array.from(this.activeSpans.values());
  }
  
  // Utility method for timing operations
  async timeOperation<T>(
    name: string,
    type: AmpTraceEvent['type'],
    operation: (spanId: string) => Promise<T>,
    parentId?: string,
    attrs?: Record<string, any>
  ): Promise<T> {
    const spanId = this.startSpan(name, type, parentId, attrs);
    
    try {
      const result = await operation(spanId);
      this.finishSpan(spanId);
      return result;
    } catch (error) {
      this.finishSpan(spanId, undefined, error as Error);
      throw error;
    }
  }
  
  // Helper for synchronous operations
  timeSync<T>(
    name: string,
    type: AmpTraceEvent['type'],
    operation: (spanId: string) => T,
    parentId?: string,
    attrs?: Record<string, any>
  ): T {
    const spanId = this.startSpan(name, type, parentId, attrs);
    
    try {
      const result = operation(spanId);
      this.finishSpan(spanId);
      return result;
    } catch (error) {
      this.finishSpan(spanId, undefined, error as Error);
      throw error;
    }
  }
}

// Global tracer instance
export const globalTracer = new AmpTracer();

// Convenience functions
export function startSpan(
  name: string, 
  type: AmpTraceEvent['type'], 
  parentId?: string,
  attrs?: Record<string, any>
): string {
  return globalTracer.startSpan(name, type, parentId, attrs);
}

export function finishSpan(
  id: string, 
  attrs?: Record<string, any>, 
  error?: Error
): AmpTraceEvent | null {
  return globalTracer.finishSpan(id, attrs, error);
}

export function setCurrentSession(sessionId: string): void {
  globalTracer.setCurrentSession(sessionId);
}

export async function timeOperation<T>(
  name: string,
  type: AmpTraceEvent['type'],
  operation: (spanId: string) => Promise<T>,
  parentId?: string,
  attrs?: Record<string, any>
): Promise<T> {
  return globalTracer.timeOperation(name, type, operation, parentId, attrs);
}
