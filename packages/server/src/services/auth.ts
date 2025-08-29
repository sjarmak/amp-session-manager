import { readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';

export class AuthService {
  private static tokenPath = join(homedir(), '.config', 'amp-session-manager', 'mobile_api_token');
  private cachedToken: string | null = null;

  async getOrCreateToken(): Promise<string> {
    if (this.cachedToken) {
      return this.cachedToken;
    }

    try {
      this.cachedToken = await readFile(AuthService.tokenPath, 'utf8');
      return this.cachedToken.trim();
    } catch (error) {
      // Token file doesn't exist, create one
      const token = this.generateToken();
      await this.saveToken(token);
      this.cachedToken = token;
      return token;
    }
  }

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  private async saveToken(token: string): Promise<void> {
    const dir = dirname(AuthService.tokenPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    
    const { writeFile } = await import('fs/promises');
    await writeFile(AuthService.tokenPath, token, 'utf8');
  }

  async validateToken(providedToken?: string): Promise<boolean> {
    if (!providedToken) {
      return false;
    }

    const expectedToken = await this.getOrCreateToken();
    return providedToken === expectedToken;
  }

  extractTokenFromHeader(authorization?: string): string | undefined {
    if (!authorization) return undefined;
    
    const match = authorization.match(/^Bearer\s+(.+)$/);
    return match?.[1];
  }
}
