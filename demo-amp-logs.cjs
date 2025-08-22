#!/usr/bin/env node

/**
 * Demo script to show Amp CLI log parsing functionality
 * 
 * This script demonstrates how the AmpLogParser can be used to extract
 * real-time telemetry and usage information from the Amp CLI logs.
 */

const { AmpLogParser } = require('./packages/core/dist/index.cjs');

console.log('🔍 Amp CLI Log Analysis Demo\n');

// Get recent activity summary
console.log('📊 Recent Activity Summary (last 24 hours):');
const summary = AmpLogParser.getActivitySummary(24);

if (summary.totalSessions === 0) {
  console.log('   No recent Amp CLI activity found');
} else {
  console.log(`   Sessions: ${summary.totalSessions}`);
  console.log(`   Tool Usages: ${summary.totalToolUsages}`);
  console.log(`   Errors: ${summary.errorCount}`);
  console.log(`   Time Range: ${summary.timeRange.start} → ${summary.timeRange.end}`);
  
  if (Object.keys(summary.toolStats).length > 0) {
    console.log('\n🛠️ Tool Usage Breakdown:');
    Object.entries(summary.toolStats)
      .sort(([,a], [,b]) => b - a)
      .forEach(([tool, count]) => {
        console.log(`   ${tool}: ${count} uses`);
      });
  }
}

// Get log file info
const modTime = AmpLogParser.getLogFileModTime();
if (modTime) {
  console.log(`\n📝 Log file last modified: ${modTime.toISOString()}`);
} else {
  console.log('\n📝 Log file not found or inaccessible');
}

// Demonstrate session extraction
console.log('\n🔄 Recent Sessions:');
const allEntries = AmpLogParser.parseLog();
const sessions = AmpLogParser.extractSessions(allEntries);

if (sessions.length === 0) {
  console.log('   No sessions found');
} else {
  sessions.slice(-5).forEach((session, index) => {
    const duration = session.endTime 
      ? new Date(session.endTime).getTime() - new Date(session.startTime).getTime()
      : Date.now() - new Date(session.startTime).getTime();
    
    console.log(`   Session ${sessions.length - 4 + index}:`);
    console.log(`     Started: ${session.startTime}`);
    console.log(`     ${session.endTime ? 'Ended' : 'Duration'}: ${session.endTime || Math.round(duration / 1000) + 's'}`);
    console.log(`     Tools Used: ${session.toolUsages.length}`);
    console.log(`     Errors: ${session.errors.length}`);
    
    if (session.errors.length > 0) {
      console.log(`     Last Error: ${session.errors[session.errors.length - 1].message}`);
    }
  });
}

// Demonstrate iteration metrics extraction
console.log('\n⚡ Demo: Simulating iteration metrics for last 10 minutes');
const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
const iterationMetrics = AmpLogParser.extractIterationMetrics(tenMinutesAgo);

console.log(`   Tools used: ${iterationMetrics.toolUsages.length}`);
console.log(`   Errors: ${iterationMetrics.errors.length}`);
console.log(`   Duration: ${Math.round(iterationMetrics.duration / 1000)}s`);

if (iterationMetrics.toolUsages.length > 0) {
  console.log('   Tool breakdown:');
  const toolStats = AmpLogParser.getToolUsageStats(iterationMetrics.toolUsages);
  Object.entries(toolStats).forEach(([tool, count]) => {
    console.log(`     ${tool}: ${count}`);
  });
}

console.log('\n✨ This demonstrates how session iteration can capture real-time');
console.log('   tool usage and telemetry from the Amp CLI logs for better');
console.log('   session tracking and analytics!');
