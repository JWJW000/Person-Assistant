package org.dromara.ai.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;
import org.dromara.common.mybatis.core.domain.BaseEntity;

import java.io.Serial;

/**
 * 用户 AI 会话表
 *
 * @author ruoyi
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("ai_chat_session")
public class AiChatSession extends BaseEntity {

    @Serial
    private static final long serialVersionUID = 1L;

    /**
     * 会话ID (UUID)
     */
    @TableId(type = IdType.INPUT)
    private String id;

    /**
     * 所属用户ID
     */
    private Long userId;

    /**
     * 关联助手ID
     */
    private Long assistantId;

    /**
     * 会话标题
     */
    private String title;

    /**
     * 是否置顶 0-否 1-是
     */
    private String isPinned;

    /**
     * 最新一条消息预览
     */
    private String lastMessagePreview;

    /**
     * 消息总计数
     */
    private Integer messageCount;

    /**
     * 状态 0-正常 1-已归档 2-已删除
     */
    private String status;
}
