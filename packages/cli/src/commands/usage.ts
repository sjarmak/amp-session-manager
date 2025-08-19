import { SessionStore } from '@ampsm/core';

export async function usageCommand(sessionId: string, options: {
  last?: boolean;
  range?: number;
  json?: boolean;
}) {
  const store = new SessionStore();
  
  try {
    const session = store.getSession(sessionId);
    if (!session) {
      console.error(`Session ${sessionId} not found`);
      process.exit(1);
    }

    const limit = options.last ? 1 : options.range;
    const stats = store.getTokenUsageStats(sessionId, limit);

    if (options.json) {
      console.log(JSON.stringify(stats, null, 2));
      return;
    }

    if (stats.length === 0) {
      console.log('No token usage data found');
      return;
    }

    console.log(`\nToken Usage for Session: ${session.name}`);
    console.log('─'.repeat(80));
    console.log('Timestamp                Model     Prompt    Completion  Total');
    console.log('─'.repeat(80));

    let totalPrompt = 0;
    let totalCompletion = 0;
    let totalTokens = 0;

    stats.forEach(stat => {
      const timestamp = new Date(stat.startTime).toLocaleString();
      const model = (stat.model || '-').padEnd(9);
      const prompt = (stat.promptTokens?.toString() || '-').padEnd(9);
      const completion = (stat.completionTokens?.toString() || '-').padEnd(11);
      const total = (stat.totalTokens?.toString() || '-').padEnd(7);

      console.log(`${timestamp.padEnd(24)} ${model} ${prompt} ${completion} ${total}`);

      if (stat.promptTokens) totalPrompt += stat.promptTokens;
      if (stat.completionTokens) totalCompletion += stat.completionTokens;
      if (stat.totalTokens) totalTokens += stat.totalTokens;
    });

    console.log('─'.repeat(80));
    console.log(`Total:                   ${' '.repeat(9)} ${totalPrompt.toString().padEnd(9)} ${totalCompletion.toString().padEnd(11)} ${totalTokens.toString().padEnd(7)}`);

    // Show model breakdown if multiple models
    const models = new Set(stats.map(s => s.model).filter(Boolean));
    if (models.size > 1) {
      console.log('\nModel Breakdown:');
      models.forEach(model => {
        const modelStats = stats.filter(s => s.model === model);
        const modelTotal = modelStats.reduce((sum, s) => sum + (s.totalTokens || 0), 0);
        console.log(`  ${model}: ${modelTotal} tokens (${modelStats.length} iterations)`);
      });
    }
  } finally {
    store.close();
  }
}
