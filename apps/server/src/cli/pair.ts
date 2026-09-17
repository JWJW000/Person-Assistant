import crypto from 'crypto';
import { createDatabase, migrate } from '../db/index.js';

async function main() {
  const db = createDatabase();
  migrate(db);

  // 生成 6 位随机高熵纯数字或大写配对码
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  const ttlSeconds = parseInt(process.env.PAIRING_TTL_SECONDS || '600', 10);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  db.prepare(`
    INSERT INTO pairing_codes (code_hash, expires_at)
    VALUES (?, ?)
  `).run(codeHash, expiresAt);

  console.log('====================================================');
  console.log('  设备配对码生成成功 (仅限单次使用)');
  console.log(`  配对码:   ${code}`);
  console.log(`  有效期至: ${expiresAt} (${ttlSeconds} 秒)`);
  console.log('  请在 Android 手机客户端的配对界面输入该配对码');
  console.log('====================================================');
}

main().catch(console.error);
