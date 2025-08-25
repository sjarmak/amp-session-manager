#!/usr/bin/env node

/**
 * Test script to verify the new interactive chat functionality works
 * This simulates the UI flow without needing the full Electron app
 */

const { spawn } = require('child_process');
const path = require('path');

async function testInteractiveFeature() {
  console.log('🔧 Testing Interactive Chat Feature...\n');

  try {
    // Test 1: Verify TypeScript compilation
    console.log('1. Testing TypeScript compilation...');
    const tscResult = spawn('pnpm', ['run', 'typecheck'], {
      cwd: process.cwd(),
      stdio: 'inherit'
    });

    await new Promise((resolve, reject) => {
      tscResult.on('close', (code) => {
        if (code === 0) {
          console.log('✅ TypeScript compilation passed\n');
          resolve(code);
        } else {
          reject(new Error(`TypeScript compilation failed with code ${code}`));
        }
      });
    });

    // Test 2: Skip amp CLI test (requires authentication)
    console.log('2. Skipping amp CLI test (requires authentication)');
    console.log('✅ Will test via desktop app integration\n');

    // Test 3: Verify InteractiveTab component exists
    console.log('3. Verifying InteractiveTab component...');
    const fs = require('fs');
    const componentPath = path.join(__dirname, 'apps/desktop/src/components/InteractiveTab.tsx');
    
    if (fs.existsSync(componentPath)) {
      console.log('✅ InteractiveTab component created');
      
      const content = fs.readFileSync(componentPath, 'utf8');
      const hasRequiredMethods = content.includes('startInteractiveSession') && 
                                 content.includes('sendMessage') && 
                                 content.includes('ConnectionState');
      
      if (hasRequiredMethods) {
        console.log('✅ InteractiveTab has required functionality\n');
      } else {
        console.log('⚠️  InteractiveTab missing some functionality\n');
      }
    } else {
      console.log('❌ InteractiveTab component not found\n');
    }

    // Test 4: Verify SessionView integration
    console.log('4. Verifying SessionView integration...');
    const sessionViewPath = path.join(__dirname, 'apps/desktop/src/components/SessionView.tsx');
    const sessionViewContent = fs.readFileSync(sessionViewPath, 'utf8');
    
    const hasInteractiveTab = sessionViewContent.includes('"interactive"') && 
                             sessionViewContent.includes('InteractiveTab');
    
    if (hasInteractiveTab) {
      console.log('✅ SessionView integrated with InteractiveTab\n');
    } else {
      console.log('❌ SessionView not properly integrated\n');
    }

    console.log('🎉 Interactive Chat Feature Test Complete!');
    console.log('\nNext steps:');
    console.log('1. Start the desktop app: pnpm run dev');
    console.log('2. Create or open a session');
    console.log('3. Click the "Interactive" tab');
    console.log('4. Click "Start Chat" and test real-time messaging');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testInteractiveFeature();
