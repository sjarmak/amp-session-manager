import { SessionStore, WorktreeManager, getDbPath, MetricsAPI, SQLiteMetricsSink, costCalculator, Logger } from '@ampsm/core';

let _store: SessionStore | null = null;
let _manager: WorktreeManager | null = null;
let _metricsAPI: MetricsAPI | null = null;

export function getSessionManager(): { store: SessionStore; manager: WorktreeManager; getMetricsAPI: () => MetricsAPI } {
  if (!_store || !_manager || !_metricsAPI) {
    const dbPath = process.env.AMPSM_DB_PATH || getDbPath();
    _store = new SessionStore(dbPath);
    _manager = new WorktreeManager(_store);
    
    // Initialize metrics API
    const logger = new Logger('CLI');
    const sqliteSink = new SQLiteMetricsSink(dbPath, logger);
    _metricsAPI = new MetricsAPI(sqliteSink, _store, logger);
  }
  
  return {
    store: _store,
    manager: _manager,
    getMetricsAPI: () => _metricsAPI!
  };
}

export function closeSessionManager(): void {
  if (_store) {
    _store.close();
    _store = null;
    _manager = null;
    _metricsAPI = null;
  }
}
