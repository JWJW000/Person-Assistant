import { createDatabase, migrate } from '../db/index.js';
import fs from 'fs';
import path from 'path';

async function main() {
  const db = createDatabase();
  migrate(db);

  const backupDir = './backups';
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `assistant_backup_${timestamp}.sqlite`);

  // 使用 SQLite 的 Online Backup API 机制，确保安全一致的 WAL 备份
  await db.backup(backupPath);

  console.log('====================================================');
  console.log(`  数据库一致性快照备份完成: ${backupPath}`);
  console.log('====================================================');
}

main().catch(console.error);
