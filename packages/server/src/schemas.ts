import { z } from 'zod';

// Request schemas
export const CreateSessionSchema = z.object({
  name: z.string().min(1),
  ampPrompt: z.string().optional(),
  repoRoot: z.string().min(1),
  baseBranch: z.string().default('main'),
  scriptCommand: z.string().optional(),
  modelOverride: z.string().optional(),
  mode: z.enum(['async', 'interactive']).default('async'),
  autoCommit: z.boolean().default(true)
});

export const IterateSessionSchema = z.object({
  prompt: z.string().optional(),
  model: z.string().optional(),
  timeout: z.number().min(1000).max(600000).default(300000)
});

export const ScanReposSchema = z.object({
  roots: z.array(z.string()).min(1),
  maxDepth: z.number().min(1).max(5).default(2),
  includeHidden: z.boolean().default(false)
});

export const CloneRepoSchema = z.object({
  url: z.string().url(),
  targetDir: z.string().min(1),
  branch: z.string().optional()
});

export const MergeSessionSchema = z.object({
  message: z.string().optional(),
  squash: z.boolean().default(true)
});

export const AddMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  idx: z.number().min(0)
});

export const SearchThreadsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().min(1).max(50).default(10)
});

export const GetDiffSchema = z.object({
  base: z.string().default('HEAD~1'),
  head: z.string().default('HEAD'),
  format: z.enum(['text', 'json']).default('text')
});

// Response schemas
export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  statusCode: z.number()
});

export const SuccessResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  message: z.string().optional()
});

// Configuration schemas
export const ConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  repoRoots: z.array(z.string()),
  defaultBranch: z.string().default('main'),
  defaultModel: z.string().optional(),
  scriptCommand: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type CreateSessionRequest = z.infer<typeof CreateSessionSchema>;
export type IterateSessionRequest = z.infer<typeof IterateSessionSchema>;
export type ScanReposRequest = z.infer<typeof ScanReposSchema>;
export type CloneRepoRequest = z.infer<typeof CloneRepoSchema>;
export type MergeSessionRequest = z.infer<typeof MergeSessionSchema>;
export type AddMessageRequest = z.infer<typeof AddMessageSchema>;
export type SearchThreadsRequest = z.infer<typeof SearchThreadsSchema>;
export type GetDiffRequest = z.infer<typeof GetDiffSchema>;
export type Config = z.infer<typeof ConfigSchema>;
