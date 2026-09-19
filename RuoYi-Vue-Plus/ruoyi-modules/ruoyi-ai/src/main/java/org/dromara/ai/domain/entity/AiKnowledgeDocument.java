package org.dromara.ai.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;
import org.dromara.common.mybatis.core.domain.BaseEntity;

import java.io.Serial;

/**
 * 知识库文档实体
 *
 * @author ruoyi
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("ai_knowledge_document")
public class AiKnowledgeDocument extends BaseEntity {

    @Serial
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 关联知识库ID
     */
    private Long kbId;

    /**
     * 文件名称
     */
    private String fileName;

    /**
     * 文件物理或OSS存储路径
     */
    private String filePath;

    /**
     * 文件大小（字节）
     */
    private Long fileSize;

    /**
     * 文件扩展名/类型
     */
    private String fileType;

    /**
     * 解析状态 0-待处理 1-解析中 2-处理完成 3-处理失败
     */
    private String parseStatus;

    /**
     * 生成切片总数
     */
    private Integer chunkCount;

    /**
     * 解析异常错误信息
     */
    private String errorMsg;
}
