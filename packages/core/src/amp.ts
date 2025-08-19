import { spawn } from 'child_process';

export class AmpAdapter {
  async runIteration(prompt: string, workingDir: string, modelOverride?: string): Promise<{
    success: boolean;
    output: string;
    tokenUsage?: number;
  }> {
    return new Promise((resolve) => {
      const args = ['--prompt', prompt];
      if (modelOverride) {
        args.push('--model', modelOverride);
      }
      
      const child = spawn('amp', args, {
        cwd: workingDir,
        stdio: ['inherit', 'pipe', 'pipe']
      });
      
      let output = '';
      let stderr = '';
      
      child.stdout?.on('data', (data) => output += data.toString());
      child.stderr?.on('data', (data) => stderr += data.toString());
      
      child.on('close', (exitCode) => {
        const tokenUsage = this.extractTokenUsage(output + stderr);
        resolve({
          success: exitCode === 0,
          output: output + stderr,
          tokenUsage
        });
      });
      
      child.on('error', (error) => {
        resolve({
          success: false,
          output: `Failed to spawn amp: ${error.message}`
        });
      });
    });
  }
  
  private extractTokenUsage(output: string): number | undefined {
    const tokenMatch = output.match(/tokens?:\s*(\d+)/i);
    return tokenMatch ? parseInt(tokenMatch[1], 10) : undefined;
  }
}
