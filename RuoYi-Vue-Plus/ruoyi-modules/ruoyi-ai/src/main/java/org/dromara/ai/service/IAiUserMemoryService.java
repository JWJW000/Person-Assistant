package org.dromara.ai.service;

import org.dromara.ai.domain.entity.AiModelConfig;

import java.util.Map;

/**
 * Hermes 三层记忆服务接口 (SOUL / USER / MEMORY)
 *
 * @author ruoyi
 */
public interface IAiUserMemoryService {

    /**
     * 获取指定用户的特定层级记忆内容（若无则兜底系统默认）
     */
    String getEffectiveContent(Long userId, String memoryType);

    /**
     * 获取用户完整的三层记忆视图（供前端展示与管理）
     */
    Map<String, Object> getUserThreeLayerMemory(Long userId);

    /**
     * 保存或更新用户特定层级的记忆
     */
    void saveOrUpdateMemory(Long userId, String memoryType, String content);

    /**
     * 清空或重置特定记忆
     */
    void clearMemory(Long userId, String memoryType);

    /**
     * 构建 Hermes 开局冻结快照系统提示词 (Frozen Snapshot)
     */
    String buildHermesSystemSnapshot(Long userId);

    /**
     * 异步对话反思提炼：分析当前交互是否产生了新的长期偏好或关键事实，自动写入并控制预算
     */
    void asyncReflectAndLearn(Long userId, String userMessage, String assistantReply, AiModelConfig config);

    /**
     * 记忆压缩整合 (Consolidation): 当条目过多或超预算时由大模型合并去重
     */
    void consolidateMemory(Long userId, String memoryType, AiModelConfig config);
}
