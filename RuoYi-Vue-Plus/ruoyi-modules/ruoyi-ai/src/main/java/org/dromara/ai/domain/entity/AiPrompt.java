package org.dromara.ai.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;
import org.dromara.common.mybatis.core.domain.BaseEntity;

import java.io.Serial;

/**
 * AI 提示词与系统指令模板表
 *
 * @author ruoyi
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("ai_prompt")
public class AiPrompt extends BaseEntity {

    @Serial
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 提示词标题 / 名称
     */
    private String title;

    /**
     * 提示词标识 / 适用角色 (英文缩写或代号)
     */
    private String act;

    /**
     * 提示词正文模板
     */
    private String content;

    /**
     * 分类: 出行助手, 编程开发, 知识助理, 语言翻译, 数据分析, 文案创作, 通用 等
     */
    private String category;

    /**
     * 变量列表 (JSON)
     */
    private String variables;

    /**
     * 是否系统内置 0-否 1-是
     */
    private String isSystem;

    /**
     * 状态 0-正常 1-停用
     */
    private String status;

    /**
     * 排序权重
     */
    private Integer sortOrder;

    /**
     * 备注说明
     */
    private String remark;

    /**
     * 所属用户ID
     */
    private Long userId;
}
