package org.dromara.ai.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;
import org.dromara.common.mybatis.core.domain.BaseEntity;

import java.io.Serial;

/**
 * Hermes 三层记忆实体 (SOUL.md / USER.md / MEMORY.md)
 *
 * @author ruoyi
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("ai_user_memory")
public class AiUserMemory extends BaseEntity {

    @Serial
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 所属用户ID
     */
    private Long userId;

    /**
     * 记忆层类型: soul(角色人设), user_profile(用户画像与偏好), fact_lessons(环境事实与经验避坑)
     */
    private String memoryType;

    /**
     * 记忆正文 (Markdown 列表或紧凑多行文本)
     */
    private String content;

    /**
     * 最大 Token 预算容量 (默认 600)
     */
    private Integer maxTokens;

    /**
     * 当前评估的 Token 数量
     */
    private Integer tokenCount;

    /**
     * 状态 0-正常 1-停用
     */
    private String status;
}
