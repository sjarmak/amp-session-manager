import type { AmpTelemetry } from '@ampsm/types';

// Model-specific cost configurations (per 1K tokens) - based on amp-eval
export const MODEL_COSTS = {
  'sonnet-4': {
    input_cost_per_1k: 0.003,    // $3.00 per 1M input tokens
    output_cost_per_1k: 0.015,   // $15.00 per 1M output tokens
    context_window: 200000,
    max_output: 4096
  },
  'gpt-5': {
    input_cost_per_1k: 0.01,     // $10.00 per 1M input tokens  
    output_cost_per_1k: 0.03,    // $30.00 per 1M output tokens
    context_window: 128000,
    max_output: 4096
  },
  'o3': {
    input_cost_per_1k: 0.04,     // $40.00 per 1M input tokens
    output_cost_per_1k: 0.12,    // $120.00 per 1M output tokens
    context_window: 200000,
    max_output: 65536
  },
  'gpt-4o': {
    input_cost_per_1k: 0.0025,   // $2.50 per 1M input tokens
    output_cost_per_1k: 0.01,    // $10.00 per 1M output tokens
    context_window: 128000,
    max_output: 16384
  },
  'gpt-4o-mini': {
    input_cost_per_1k: 0.00015,  // $0.15 per 1M input tokens
    output_cost_per_1k: 0.0006,  // $0.60 per 1M output tokens
    context_window: 128000,
    max_output: 16384
  },
  'claude-3-5-sonnet': {
    input_cost_per_1k: 0.003,    // $3.00 per 1M input tokens
    output_cost_per_1k: 0.015,   // $15.00 per 1M output tokens
    context_window: 200000,
    max_output: 4096
  }
} as const;

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextUtilization?: number;
}

export class CostCalculator {
  
  /**
   * Calculate cost breakdown for a given telemetry result
   */
  static calculateCost(telemetry: AmpTelemetry): CostBreakdown {
    const model = telemetry.model || 'unknown';
    const inputTokens = telemetry.promptTokens || 0;
    const outputTokens = telemetry.completionTokens || 0;
    const totalTokens = telemetry.totalTokens || inputTokens + outputTokens;
    
    // Get model costs or use defaults
    const modelCosts = MODEL_COSTS[model as keyof typeof MODEL_COSTS];
    
    let inputCostPer1k: number;
    let outputCostPer1k: number;
    let contextWindow: number;
    
    if (modelCosts) {
      inputCostPer1k = modelCosts.input_cost_per_1k;
      outputCostPer1k = modelCosts.output_cost_per_1k;
      contextWindow = modelCosts.context_window;
    } else {
      // Default costs for unknown models
      inputCostPer1k = 0.001;   // $1.00 per 1M input tokens
      outputCostPer1k = 0.003;  // $3.00 per 1M output tokens
      contextWindow = 128000;
    }
    
    const inputCost = (inputTokens / 1000) * inputCostPer1k;
    const outputCost = (outputTokens / 1000) * outputCostPer1k;
    const totalCost = inputCost + outputCost;
    
    // Calculate context utilization if we have the data
    const contextUtilization = totalTokens > 0 ? (totalTokens / contextWindow) : undefined;
    
    return {
      inputCost,
      outputCost,
      totalCost,
      model,
      inputTokens,
      outputTokens,
      totalTokens,
      contextUtilization
    };
  }
  
  /**
   * Calculate total cost for multiple telemetry results
   */
  static calculateTotalCost(telemetryResults: AmpTelemetry[]): {
    totalCost: number;
    totalTokens: number;
    costByModel: Record<string, number>;
    tokensByModel: Record<string, number>;
    breakdowns: CostBreakdown[];
  } {
    const costByModel: Record<string, number> = {};
    const tokensByModel: Record<string, number> = {};
    const breakdowns: CostBreakdown[] = [];
    let totalCost = 0;
    let totalTokens = 0;
    
    for (const telemetry of telemetryResults) {
      const breakdown = this.calculateCost(telemetry);
      breakdowns.push(breakdown);
      
      totalCost += breakdown.totalCost;
      totalTokens += breakdown.totalTokens;
      
      const model = breakdown.model;
      costByModel[model] = (costByModel[model] || 0) + breakdown.totalCost;
      tokensByModel[model] = (tokensByModel[model] || 0) + breakdown.totalTokens;
    }
    
    return {
      totalCost,
      totalTokens,
      costByModel,
      tokensByModel,
      breakdowns
    };
  }
  
  /**
   * Format cost as currency string
   */
  static formatCost(cost: number): string {
    if (cost < 0.01) {
      return `$${(cost * 1000).toFixed(3)}‰`; // Show in per-mille for very small costs
    }
    return `$${cost.toFixed(4)}`;
  }
  
  /**
   * Format tokens with appropriate units
   */
  static formatTokens(tokens: number): string {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  }
  
  /**
   * Assess performance degradation based on context usage
   */
  static assessContextDegradation(breakdown: CostBreakdown): string | null {
    if (!breakdown.contextUtilization) {
      return null;
    }
    
    const utilization = breakdown.contextUtilization;
    
    if (utilization > 0.95) {
      return 'critical_context_usage';
    } else if (utilization > 0.85) {
      return 'high_context_usage';
    } else if (utilization > 0.7) {
      return 'moderate_context_usage';
    }
    
    return null;
  }
  
  /**
   * Get supported models list
   */
  static getSupportedModels(): string[] {
    return Object.keys(MODEL_COSTS);
  }
  
  /**
   * Check if a model has cost data
   */
  static isModelSupported(model: string): boolean {
    return model in MODEL_COSTS;
  }
}
