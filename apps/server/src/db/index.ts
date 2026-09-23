import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export function createDatabase(dbPath: string = process.env.DATABASE_PATH || './data/assistant.sqlite'): Database.Database {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  // 启用 WAL 模式及外键
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  return db;
}

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS pairing_codes (
      code_hash TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      consumed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      query_state_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      run_id TEXT,
      role TEXT NOT NULL,
      parts_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      conversation_id TEXT,
      client_request_id TEXT NOT NULL,
      request_hash TEXT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      config_version INTEGER NOT NULL DEFAULT 1,
      error_code TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      UNIQUE(device_id, client_request_id)
    );

    CREATE TABLE IF NOT EXISTS run_events (
      run_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (run_id, seq)
    );

    CREATE TABLE IF NOT EXISTS query_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT 1,
      payload_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      parent_id TEXT
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      query_json TEXT NOT NULL,
      snapshot_result_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS preferences (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      source_message_id TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS model_profiles (
      id TEXT PRIMARY KEY,
      base_url TEXT NOT NULL,
      api TEXT NOT NULL,
      model_id TEXT NOT NULL,
      secret_ciphertext TEXT,
      key_version INTEGER NOT NULL DEFAULT 1,
      config_version INTEGER NOT NULL DEFAULT 1,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS pi_hosts (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      platform TEXT NOT NULL,
      pi_version TEXT NOT NULL DEFAULT '',
      capabilities_json TEXT NOT NULL DEFAULT '[]',
      models_json TEXT NOT NULL DEFAULT '[]',
      sessions_json TEXT NOT NULL DEFAULT '[]',
      credential_hash TEXT NOT NULL UNIQUE,
      credential_version INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS pi_projects (
      id TEXT PRIMARY KEY,
      host_id TEXT NOT NULL,
      runner_project_key TEXT NOT NULL,
      name TEXT NOT NULL,
      display_path TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      UNIQUE(host_id, runner_project_key),
      FOREIGN KEY (host_id) REFERENCES pi_hosts(id)
    );

    CREATE TABLE IF NOT EXISTS pi_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      session_ref TEXT,
      model_json TEXT,
      messages_snapshot_json TEXT,
      snapshot_cursors_json TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES pi_projects(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS pi_tasks_active_session
      ON pi_tasks(project_id, session_ref) WHERE session_ref IS NOT NULL AND archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS pi_runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      activity TEXT,
      outcome_json TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      FOREIGN KEY (task_id) REFERENCES pi_tasks(id)
    );

    CREATE TABLE IF NOT EXISTS pi_commands (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      client_request_id TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      task_id TEXT NOT NULL,
      run_id TEXT,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      response_json TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(tenant_id, owner_user_id, client_request_id),
      FOREIGN KEY (task_id) REFERENCES pi_tasks(id),
      FOREIGN KEY (run_id) REFERENCES pi_runs(id)
    );

    CREATE TABLE IF NOT EXISTS pi_events (
      run_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      PRIMARY KEY (run_id, seq),
      FOREIGN KEY (run_id) REFERENCES pi_runs(id)
    );

    CREATE TABLE IF NOT EXISTS pi_pairing_codes (
      code_hash TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS pi_tasks_project_updated ON pi_tasks(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS pi_runs_task_created ON pi_runs(task_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS pi_events_output ON pi_events(run_id, type, seq);
  `);

  const hostColumns = new Set((db.prepare('PRAGMA table_info(pi_hosts)').all() as Array<{ name: string }>).map((column) => column.name));
  if (!hostColumns.has('models_json')) db.exec("ALTER TABLE pi_hosts ADD COLUMN models_json TEXT NOT NULL DEFAULT '[]'");
  if (!hostColumns.has('sessions_json')) db.exec("ALTER TABLE pi_hosts ADD COLUMN sessions_json TEXT NOT NULL DEFAULT '[]'");
}
