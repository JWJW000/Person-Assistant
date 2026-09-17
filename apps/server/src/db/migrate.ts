import { createDatabase, migrate } from './index.js';

async function run() {
  const db = createDatabase();
  migrate(db);
  console.log('数据库迁移完成。');
}

run();
