package org.dromara.ai.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 知识库切片实体 (包含 pgvector 向量)
 *
 * @author ruoyi
 */
@Data
@TableName("ai_knowledge_chunk")
public class AiKnowledgeChunk implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 所属知识库ID
     */
    private Long kbId;

    /**
     * 所属文档ID (若为手动录入则可为 0 或 null)
     */
    private Long docId;

    /**
     * 切片序号
     */
    private Integer chunkOrder;

    /**
     * 切片文本正文
     */
    private String content;

    /**
     * 切片字符/Token数
     */
    private Integer tokenCount;

    /**
     * 1536维向量字符串表示，形如 "[0.012, -0.045, ...]"
     */
    @TableField(exist = false)
    private String embedding;

    /**
     * 向量余弦检索得分 0.0 ~ 1.0 (非持久化字段，由检索查询投射产生)
     */
    @TableField(exist = false)
    private Double score;

    /**
     * 状态 0-正常 1-停用
     */
    private String status;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;
}
