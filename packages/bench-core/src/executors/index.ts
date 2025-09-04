import { QAExecutor } from './qa.js'
import { SessionExecutor } from './session.js'
import { ExecutorRegistry } from '../types/executor.js'

export { QAExecutor } from './qa.js'
export { SessionExecutor } from './session.js'

export const createExecutorRegistry = (): ExecutorRegistry => ({
  qa: new QAExecutor(),
  session: new SessionExecutor(),
  swebench: new SessionExecutor() // For now, swebench uses session executor
})
