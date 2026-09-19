package org.dromara.ai.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;
import org.dromara.common.mybatis.core.domain.BaseEntity;

import java.io.Serial;
import java.math.BigDecimal;

/**
 * AI 模型配置表
 *
 * @author ruoyi
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("ai_model_config")
public class AiModelConfig extends BaseEntity {

    @Serial
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 配置别名
     */
    private String name;

    /**
     * 厂商: deepseek, openai, ollama, qwen 等
     */
    private String provider;

    /**
     * 模型类型: chat, embedding, rerank
     */
    private String modelType;

    /**
     * 模型名称，如 deepseek-chat, text-embedding-3-small
     */
    private String modelName;

    /**
     * API 密钥
     */
    private String apiKey;

    /**
     * API 地址
     */
    private String baseUrl;

    /**
     * 温度系数
     */
    private BigDecimal temperature;

    /**
     * 最大生成 Token 数
     */
    private Integer maxTokens;

    /**
     * 向量维度
     */
    private Integer dimensions;

    /**
     * 是否默认 0-否 1-是
     */
    private String isDefault;

    /**
     * 状态 0-正常 1-停用
     */
    private String status;

    /**
     * 备注
     */
    private String remark;
}
