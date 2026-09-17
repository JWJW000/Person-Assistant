# 备份与灾难恢复手册 (BACKUP_RESTORE.md)

## 1. 备份机制
后端使用 SQLite 的 Online Backup API。在服务处于 WAL (Write-Ahead Logging) 运行状态下，无需停服即可生成一致性快照。

### 执行热备份
```bash
# 本地或在容器内执行
pnpm backup
```
备份文件将保存于 `./backups/assistant_backup_<timestamp>.sqlite`。

## 2. 灾难恢复演练

1. **停止运行中的服务**:
   ```bash
   docker compose -f deploy/docker-compose.yml stop
   ```

2. **替换目标数据库文件**:
   ```bash
   cp ./backups/assistant_backup_xxxx.sqlite /app/data/assistant.sqlite
   # 移除可能残留的 WAL / SHM 临时缓存文件
   rm -f /app/data/assistant.sqlite-wal /app/data/assistant.sqlite-shm
   ```

3. **安全凭据失效与重新配对**:
   恢复旧库后，所有在备份点之后被撤销的设备状态可能会发生回滚。为了安全起见，建议手动撤销异常设备，或执行一次配对重新发放 Token：
   ```bash
   pnpm device:pair
   ```

4. **重启服务并验证数据完整性**:
   ```bash
   docker compose -f deploy/docker-compose.yml start
   curl -i http://127.0.0.1:3000/healthz
   ```
