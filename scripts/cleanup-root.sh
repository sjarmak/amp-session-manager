#!/bin/bash
# Root directory cleanup script
# This script organizes files into appropriate directories without breaking dependencies

set -e

echo "🧹 Cleaning up root directory..."

# Create directories if they don't exist
mkdir -p scripts/debug
mkdir -p scripts/test
mkdir -p docs/analysis
mkdir -p .temp

# Move debug files (but preserve dependencies)
echo "📁 Moving debug files..."
mv debug-*.cjs scripts/debug/ 2>/dev/null || true
mv debug-*.js scripts/debug/ 2>/dev/null || true
mv debug-*.md docs/analysis/ 2>/dev/null || true

# Move test files (but preserve ones referenced in code)
echo "📁 Moving test files..."
mv test-alloy-*.cjs scripts/test/ 2>/dev/null || true
mv test-auth-*.cjs scripts/test/ 2>/dev/null || true
mv test-env-*.cjs scripts/test/ 2>/dev/null || true
mv test-git-*.cjs scripts/test/ 2>/dev/null || true
mv test-model-*.cjs scripts/test/ 2>/dev/null || true
mv test-thread-*.cjs scripts/test/ 2>/dev/null || true
mv test-duplicate-*.js scripts/test/ 2>/dev/null || true

# Move analysis/summary files
echo "📁 Moving analysis files..."
mv *ANALYSIS*.md docs/analysis/ 2>/dev/null || true  
mv *SUMMARY*.md docs/analysis/ 2>/dev/null || true
mv *POSTMORTEM*.md docs/analysis/ 2>/dev/null || true
mv *ROADMAP*.md docs/analysis/ 2>/dev/null || true
mv enhanced-*.md docs/analysis/ 2>/dev/null || true
mv streaming-*.md docs/analysis/ 2>/dev/null || true
mv verify-*.md docs/analysis/ 2>/dev/null || true

# Move batch files to temp (these look generated)
echo "📁 Moving batch files to temp..."
mv batch-*.json .temp/ 2>/dev/null || true
mv batch-*.md .temp/ 2>/dev/null || true

# Move backup files to temp
echo "📁 Moving backup files..."
mv *.backup .temp/ 2>/dev/null || true

# Add .temp to .gitignore if not already there
if ! grep -q "^\.temp/$" .gitignore 2>/dev/null; then
    echo "/.temp/" >> .gitignore
fi

echo "✅ Root cleanup complete!"
echo "📋 Preserved files that have dependencies:"
echo "   - test-amp-debug-parsing.py (generates amp-debug-test-results.json)"
echo "   - test-batch-plan.yaml (used by test-batch-fix.js)"
echo "   - test-streaming-simple.cjs (referenced in docs)"
echo "   - test-simple.js (referenced in multiple places)"
echo "   - show-actual-metrics.sh (referenced script)"
echo "   - test-cli-streaming.sh (main test script)"
