package org.dromara.ai.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;
import org.dromara.common.mybatis.core.domain.BaseEntity;

import java.io.Serial;

/**
 * 知识库主表
 *
 * @author ruoyi
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("ai_knowledge_base")
public class AiKnowledgeBase extends BaseEntity {

    @Serial
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 知识库名称
     */
    private String name;

    /**
     * 封面头像
     */
    private String avatar;

    /**
     * 知识库描述
     */
    private String description;

    /**
     * 绑定的 Embedding 模型配置ID
     */
    private Long embeddingModelId;

    /**
     * 是否公开 0-私有 1-公开
     */
    private String isPublic;

    /**
     * 切片大小
     */
    private Integer chunkSize;

    /**
     * 切片重叠字数
     */
    private Integer chunkOverlap;

    /**
     * 状态 0-正常 1-停用
     */
    private String status;
}
