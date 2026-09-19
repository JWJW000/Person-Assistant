package org.dromara.ai.service;

import org.dromara.ai.domain.entity.AiModelConfig;
import org.dromara.common.core.domain.PageResult;
import org.dromara.common.mybatis.core.page.PageQuery;

import java.util.List;

/**
 * AI 模型配置业务接口
 *
 * @author ruoyi
 */
public interface IAiModelConfigService {

    PageResult<AiModelConfig> selectModelList(AiModelConfig config, PageQuery pageQuery);

    List<AiModelConfig> selectModelListAll(String modelType);

    AiModelConfig selectModelById(Long id);

    boolean insertModel(AiModelConfig config);

    boolean updateModel(AiModelConfig config);

    boolean deleteModelById(Long id);

    boolean setDefaultModel(Long id);
}
