package org.dromara.ai.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.util.Date;

/**
 * 会话消息详情表
 *
 * @author ruoyi
 */
@Data
@TableName("ai_chat_message")
public class AiChatMessage implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 所属会话ID
     */
    private String sessionId;

    /**
     * 所属用户ID
     */
    private Long userId;

    /**
     * 角色: user, assistant, system
     */
    private String role;

    /**
     * 消息正文
     */
    private String content;

    /**
     * RAG 命中的知识库引用 (JSON 格式)
     */
    private String citations;

    /**
     * 模型名称
     */
    private String modelName;

    /**
     * 提示词 Token
     */
    private Integer promptTokens;

    /**
     * 回复 Token
     */
    private Integer completionTokens;

    /**
     * 总 Token
     */
    private Integer totalTokens;

    /**
     * 响应总耗时(ms)
     */
    private Integer responseTimeMs;

    /**
     * 状态: generating, success, error
     */
    private String status;

    /**
     * 异常原因
     */
    private String errorMsg;

    /**
     * 创建时间
     */
    private Date createTime;
}
