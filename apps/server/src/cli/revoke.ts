import { createDatabase, migrate } from '../db/index.js';

async function main() {
  const deviceId = process.argv[2];
  if (!deviceId) {
    console.error('用法: pnpm device:revoke <deviceId>');
    process.exit(1);
  }

  const db = createDatabase();
  migrate(db);

  const result = db.prepare(`
    UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL
  `).run(new Date().toISOString(), deviceId);

  if (result.changes > 0) {
    console.log(`设备 ${deviceId} 已成功撤销授权。`);
  } else {
    console.log(`未找到活跃的设备 ${deviceId} 或该设备已被注销。`);
  }
}

main().catch(console.error);
