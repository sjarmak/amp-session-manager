import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export async function getCurrentAmpThreadId(): Promise<string | null> {
  try {
    const threadIdPath = join(homedir(), '.local', 'state', 'amp', 'last-thread-id');
    const threadId = await readFile(threadIdPath, 'utf-8');
    return threadId.trim();
  } catch {
    return null;
  }
}
