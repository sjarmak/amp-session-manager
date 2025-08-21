export interface ModelPricing {
  name: string;
  promptPricePer1k: number;  // USD per 1000 prompt tokens
  completionPricePer1k: number;  // USD per 1000 completion tokens
  inputPricePer1k?: number;  // Alternative naming
  outputPricePer1k?: number;  // Alternative naming
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
}

export interface CostBreakdown {
  promptCost: number;
  completionCost: number;
  totalCost: number;
  promptTokens: number;
  completionTokens: number;
  model: string;
}

export class CostCalculator {
  private pricingTable: Map<string, ModelPricing> = new Map();

  constructor() {
    this.loadDefaultPricing();
  }

  private loadDefaultPricing(): void {
    const defaultPricing: ModelPricing[] = [
      // OpenAI Models
      {
        name: 'gpt-4o',
        promptPricePer1k: 0.0025,
        completionPricePer1k: 0.01
      },
      {
        name: 'gpt-4o-mini',
        promptPricePer1k: 0.00015,
        completionPricePer1k: 0.0006
      },
      {
        name: 'gpt-4-turbo',
        promptPricePer1k: 0.01,
        completionPricePer1k: 0.03
      },
      {
        name: 'gpt-4',
        promptPricePer1k: 0.03,
        completionPricePer1k: 0.06
      },
      {
        name: 'gpt-3.5-turbo',
        promptPricePer1k: 0.0015,
        completionPricePer1k: 0.002
      },
      {
        name: 'gpt-3.5-turbo-instruct',
        promptPricePer1k: 0.0015,
        completionPricePer1k: 0.002
      },
      // Anthropic Models
      {
        name: 'claude-3-5-sonnet-20241022',
        promptPricePer1k: 0.003,
        completionPricePer1k: 0.015
      },
      {
        name: 'claude-3-5-sonnet-20240620',
        promptPricePer1k: 0.003,
        completionPricePer1k: 0.015
      },
      {
        name: 'claude-3-opus-20240229',
        promptPricePer1k: 0.015,
        completionPricePer1k: 0.075
      },
      {
        name: 'claude-3-sonnet-20240229',
        promptPricePer1k: 0.003,
        completionPricePer1k: 0.015
      },
      {
        name: 'claude-3-haiku-20240307',
        promptPricePer1k: 0.00025,
        completionPricePer1k: 0.00125
      },
      {
        name: 'claude-2.1',
        promptPricePer1k: 0.008,
        completionPricePer1k: 0.024
      },
      {
        name: 'claude-2.0',
        promptPricePer1k: 0.008,
        completionPricePer1k: 0.024
      },
      {
        name: 'claude-instant-1.2',
        promptPricePer1k: 0.0008,
        completionPricePer1k: 0.0024
      },
      // Google Models
      {
        name: 'gemini-1.5-pro',
        promptPricePer1k: 0.0035,
        completionPricePer1k: 0.0105
      },
      {
        name: 'gemini-1.5-flash',
        promptPricePer1k: 0.000075,
        completionPricePer1k: 0.0003
      },
      {
        name: 'gemini-pro',
        promptPricePer1k: 0.0005,
        completionPricePer1k: 0.0015
      },
      // Azure OpenAI (typically same as OpenAI)
      {
        name: 'azure-gpt-4',
        promptPricePer1k: 0.03,
        completionPricePer1k: 0.06
      },
      {
        name: 'azure-gpt-35-turbo',
        promptPricePer1k: 0.0015,
        completionPricePer1k: 0.002
      },
      // Generic fallback
      {
        name: 'unknown',
        promptPricePer1k: 0.01,
        completionPricePer1k: 0.03
      }
    ];

    for (const pricing of defaultPricing) {
      this.addModel(pricing);
    }
  }

  addModel(pricing: ModelPricing): void {
    // Normalize model name (lowercase, handle aliases)
    const normalizedName = this.normalizeModelName(pricing.name);
    this.pricingTable.set(normalizedName, pricing);
  }

  updateModel(modelName: string, pricing: Partial<ModelPricing>): boolean {
    const normalizedName = this.normalizeModelName(modelName);
    const existing = this.pricingTable.get(normalizedName);
    
    if (!existing) {
      return false;
    }

    const updated: ModelPricing = {
      ...existing,
      ...pricing,
      name: normalizedName
    };

    this.pricingTable.set(normalizedName, updated);
    return true;
  }

  removeModel(modelName: string): boolean {
    const normalizedName = this.normalizeModelName(modelName);
    return this.pricingTable.delete(normalizedName);
  }

  getPricing(modelName: string): ModelPricing | null {
    const normalizedName = this.normalizeModelName(modelName);
    return this.pricingTable.get(normalizedName) || null;
  }

  getAllModels(): ModelPricing[] {
    return Array.from(this.pricingTable.values());
  }

  calculateCost(usage: TokenUsage): CostBreakdown {
    const pricing = this.getPricing(usage.model);
    
    if (!pricing) {
      // Use fallback pricing for unknown models
      const fallback = this.pricingTable.get('unknown')!;
      const promptCost = (usage.promptTokens / 1000) * fallback.promptPricePer1k;
      const completionCost = (usage.completionTokens / 1000) * fallback.completionPricePer1k;
      
      return {
        promptCost,
        completionCost,
        totalCost: promptCost + completionCost,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        model: usage.model
      };
    }

    const promptCost = (usage.promptTokens / 1000) * pricing.promptPricePer1k;
    const completionCost = (usage.completionTokens / 1000) * pricing.completionPricePer1k;

    return {
      promptCost,
      completionCost,
      totalCost: promptCost + completionCost,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      model: usage.model
    };
  }

  calculateBatchCost(usages: TokenUsage[]): {
    breakdown: CostBreakdown[];
    totalCost: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    costByModel: Record<string, number>;
  } {
    const breakdown = usages.map(usage => this.calculateCost(usage));
    const totalCost = breakdown.reduce((sum, cost) => sum + cost.totalCost, 0);
    const totalPromptTokens = breakdown.reduce((sum, cost) => sum + cost.promptTokens, 0);
    const totalCompletionTokens = breakdown.reduce((sum, cost) => sum + cost.completionTokens, 0);
    
    const costByModel: Record<string, number> = {};
    for (const cost of breakdown) {
      costByModel[cost.model] = (costByModel[cost.model] || 0) + cost.totalCost;
    }

    return {
      breakdown,
      totalCost,
      totalPromptTokens,
      totalCompletionTokens,
      costByModel
    };
  }

  estimateCost(promptLength: number, expectedCompletionLength: number, model: string): CostBreakdown {
    // Rough estimation: 1 token ≈ 4 characters for English text
    const estimatedPromptTokens = Math.ceil(promptLength / 4);
    const estimatedCompletionTokens = Math.ceil(expectedCompletionLength / 4);

    return this.calculateCost({
      promptTokens: estimatedPromptTokens,
      completionTokens: estimatedCompletionTokens,
      totalTokens: estimatedPromptTokens + estimatedCompletionTokens,
      model
    });
  }

  compareModels(usage: Omit<TokenUsage, 'model'>, models: string[]): {
    model: string;
    cost: CostBreakdown;
    savings?: number;
    savingsPercent?: number;
  }[] {
    const results = models.map(model => ({
      model,
      cost: this.calculateCost({ ...usage, model })
    }));

    // Sort by total cost
    results.sort((a, b) => a.cost.totalCost - b.cost.totalCost);

    // Calculate savings relative to most expensive
    const maxCost = Math.max(...results.map(r => r.cost.totalCost));
    
    return results.map(result => ({
      ...result,
      savings: maxCost - result.cost.totalCost,
      savingsPercent: maxCost > 0 ? ((maxCost - result.cost.totalCost) / maxCost) * 100 : 0
    }));
  }

  private normalizeModelName(modelName: string): string {
    // Normalize model names for consistent lookup
    const normalized = modelName.toLowerCase().trim();
    
    // Handle common aliases and variations
    const aliases: Record<string, string> = {
      'gpt4': 'gpt-4',
      'gpt-4-0613': 'gpt-4',
      'gpt-4-32k': 'gpt-4',
      'gpt35': 'gpt-3.5-turbo',
      'gpt-3.5': 'gpt-3.5-turbo',
      'claude3': 'claude-3-sonnet-20240229',
      'claude-3': 'claude-3-sonnet-20240229',
      'claude-3-sonnet': 'claude-3-sonnet-20240229',
      'claude-3-opus': 'claude-3-opus-20240229',
      'claude-3-haiku': 'claude-3-haiku-20240307',
      'claude-sonnet': 'claude-3-5-sonnet-20241022',
      'gemini-pro-1.5': 'gemini-1.5-pro',
      'gemini-flash-1.5': 'gemini-1.5-flash'
    };

    return aliases[normalized] || normalized;
  }

  // Utility methods for cost tracking
  formatCost(cost: number): string {
    if (cost < 0.001) {
      return `$${(cost * 1000).toFixed(4)}k`; // Show in thousandths
    } else if (cost < 1) {
      return `$${cost.toFixed(4)}`;
    } else {
      return `$${cost.toFixed(2)}`;
    }
  }

  getTokensPerDollar(model: string): { prompt: number; completion: number } {
    const pricing = this.getPricing(model);
    
    if (!pricing) {
      return { prompt: 0, completion: 0 };
    }

    return {
      prompt: Math.floor(1000 / pricing.promptPricePer1k),
      completion: Math.floor(1000 / pricing.completionPricePer1k)
    };
  }

  getCostEfficiencyRatio(usage: TokenUsage): number {
    // Calculate "value" as tokens generated per dollar spent
    const cost = this.calculateCost(usage);
    
    if (cost.totalCost === 0) {
      return Infinity;
    }

    return usage.totalTokens / cost.totalCost;
  }

  // Configuration methods
  loadPricingFromConfig(config: Record<string, ModelPricing>): void {
    for (const [name, pricing] of Object.entries(config)) {
      this.addModel({ ...pricing, name });
    }
  }

  exportPricingConfig(): Record<string, ModelPricing> {
    const config: Record<string, ModelPricing> = {};
    
    for (const [name, pricing] of this.pricingTable) {
      config[name] = pricing;
    }

    return config;
  }
}

// Singleton instance for global use
export const costCalculator = new CostCalculator();
