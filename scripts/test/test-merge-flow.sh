#!/bin/bash

# Test script for merge-to-main flow
set -e

echo "🧪 Testing Merge-to-Main Flow"
echo "=============================="

# Setup test repo
TEST_REPO="$HOME/amp-merge-test-$(date +%s)"
CLI_PATH="/Users/sjarmak/amp-workflow-manager-v2/packages/cli/dist/index.js"

echo "📁 Setting up test repository: $TEST_REPO"
mkdir -p "$TEST_REPO"
cd "$TEST_REPO"

git init
git config user.email "test@example.com"
git config user.name "Test User"

# Create initial commits
echo "# Test Repository for Merge Flow" > README.md
git add README.md
git commit -m "Initial commit"

echo "const version = '1.0.0';" > version.js
git add version.js  
git commit -m "Add version file"

echo "✅ Test repository created"

# Test 1: Create session
echo "🚀 Test 1: Creating session"
SESSION_OUTPUT=$(node "$CLI_PATH" new \
  --repo "$TEST_REPO" \
  --name "Test Feature" \
  --prompt "Add a utility function for string manipulation" \
  --script "echo 'Tests would run here' && exit 0")

echo "$SESSION_OUTPUT"

# Extract session ID (this is a simple approach, might need adjustment)
SESSION_ID=$(node "$CLI_PATH" list | grep "Test Feature" | head -1 | awk '{print $1}' || echo "")

if [ -z "$SESSION_ID" ]; then
  echo "❌ Failed to create session or extract session ID"
  exit 1
fi

echo "✅ Session created: $SESSION_ID"

# Test 2: Add changes to session
echo "🔧 Test 2: Adding changes to session"
WORKTREE_PATH="$TEST_REPO/.worktrees/$SESSION_ID"

if [ ! -d "$WORKTREE_PATH" ]; then
  echo "❌ Worktree not found at $WORKTREE_PATH"
  exit 1
fi

cd "$WORKTREE_PATH"

# Add some changes
echo "function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }" > utils.js
echo "function reverse(str) { return str.split('').reverse().join(''); }" >> utils.js
git add utils.js
git commit -m "amp: add string utilities"

echo "const { capitalize, reverse } = require('./utils');" > example.js
echo "console.log(capitalize('hello')); // Hello" >> example.js
echo "console.log(reverse('hello')); // olleh" >> example.js
git add example.js
git commit -m "amp: add example usage"

echo "✅ Changes added to session"

# Test 3: Preflight checks
echo "🔍 Test 3: Running preflight checks"
cd /Users/sjarmak/amp-workflow-manager-v2/packages/cli
PREFLIGHT_OUTPUT=$(node "$CLI_PATH" preflight "$SESSION_ID")
echo "$PREFLIGHT_OUTPUT"

if echo "$PREFLIGHT_OUTPUT" | grep -q "All checks passed"; then
  echo "✅ Preflight checks passed"
else
  echo "⚠️  Preflight checks had issues, continuing anyway"
fi

# Test 4: Complete merge flow
echo "🔄 Test 4: Running complete merge flow"
MERGE_OUTPUT=$(node "$CLI_PATH" merge "$SESSION_ID" \
  --message "feat: add string manipulation utilities with examples" \
  --export-patch "$TEST_REPO/feature.patch")

echo "$MERGE_OUTPUT"

if echo "$MERGE_OUTPUT" | grep -q "merged successfully"; then
  echo "✅ Merge completed successfully"
else
  echo "❌ Merge failed"
  echo "$MERGE_OUTPUT"
  exit 1
fi

# Test 5: Verify merge result
echo "✔️  Test 5: Verifying merge result"
cd "$TEST_REPO"

if [ -f "utils.js" ] && [ -f "example.js" ]; then
  echo "✅ Files merged correctly"
  echo "📄 utils.js content:"
  cat utils.js
  echo "📄 example.js content:"
  cat example.js
else
  echo "❌ Files not found after merge"
  ls -la
  exit 1
fi

# Test 6: Verify patch export
if [ -f "$TEST_REPO/feature.patch" ]; then
  echo "✅ Patch file exported successfully"
  echo "📄 Patch size: $(wc -l < $TEST_REPO/feature.patch) lines"
else
  echo "❌ Patch file not found"
fi

# Test 7: Cleanup
echo "🧹 Test 7: Testing cleanup"
CLEANUP_OUTPUT=$(node "$CLI_PATH" cleanup "$SESSION_ID" --yes)
echo "$CLEANUP_OUTPUT"

if echo "$CLEANUP_OUTPUT" | grep -q "cleaned up successfully"; then
  echo "✅ Cleanup completed successfully"
else
  echo "❌ Cleanup failed"
  echo "$CLEANUP_OUTPUT"
fi

# Test 8: Verify cleanup
if [ ! -d "$WORKTREE_PATH" ]; then
  echo "✅ Worktree removed successfully"
else
  echo "❌ Worktree still exists after cleanup"
fi

# Final verification
echo "🔍 Final verification: Git history"
cd "$TEST_REPO"
git log --oneline -n 5

echo ""
echo "🎉 All tests completed!"
echo "Test repository: $TEST_REPO"
echo "You can manually inspect the repository to verify the merge"

echo ""
echo "To clean up test repository:"
echo "rm -rf '$TEST_REPO'"
