import { execSync } from 'child_process';
import fs from 'fs';

// Compile preload.ts to CommonJS
execSync('npx tsc src/preload.ts --target ES2022 --module CommonJS --moduleResolution Node --allowSyntheticDefaultImports --esModuleInterop --strict --skipLibCheck --forceConsistentCasingInFileNames --outDir dist', {
  stdio: 'inherit',
  cwd: process.cwd()
});

console.log('Preload script compiled to CommonJS');
