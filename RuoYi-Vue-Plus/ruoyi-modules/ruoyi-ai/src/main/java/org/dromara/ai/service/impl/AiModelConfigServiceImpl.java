package org.dromara.ai.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.dromara.ai.domain.entity.AiModelConfig;
import org.dromara.ai.mapper.AiModelConfigMapper;
import org.dromara.ai.service.IAiModelConfigService;
import org.dromara.common.core.domain.PageResult;
import org.dromara.common.mybatis.core.page.PageQuery;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * AI 模型配置业务实现
 *
 * @author ruoyi
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiModelConfigServiceImpl implements IAiModelConfigService {

    private final AiModelConfigMapper modelConfigMapper;

    @Override
    public PageResult<AiModelConfig> selectModelList(AiModelConfig config, PageQuery pageQuery) {
        LambdaQueryWrapper<AiModelConfig> lqw = new LambdaQueryWrapper<>();
        if (config != null) {
            lqw.like(config.getName() != null && !config.getName().isBlank(), AiModelConfig::getName, config.getName())
               .eq(config.getProvider() != null && !config.getProvider().isBlank(), AiModelConfig::getProvider, config.getProvider())
               .eq(config.getModelType() != null && !config.getModelType().isBlank(), AiModelConfig::getModelType, config.getModelType())
               .eq(config.getStatus() != null && !config.getStatus().isBlank(), AiModelConfig::getStatus, config.getStatus());
        }
        lqw.orderByDesc(AiModelConfig::getIsDefault);
        lqw.orderByDesc(AiModelConfig::getCreateTime);
        Page<AiModelConfig> page = modelConfigMapper.selectPage(pageQuery.build(), lqw);
        return PageResult.build(page.getRecords(), page.getTotal());
    }

    @Override
    public List<AiModelConfig> selectModelListAll(String modelType) {
        LambdaQueryWrapper<AiModelConfig> lqw = new LambdaQueryWrapper<AiModelConfig>()
            .eq(AiModelConfig::getStatus, "0");
        if (modelType != null && !modelType.isBlank()) {
            lqw.eq(AiModelConfig::getModelType, modelType);
        }
        lqw.orderByDesc(AiModelConfig::getIsDefault)
           .orderByDesc(AiModelConfig::getCreateTime);
        return modelConfigMapper.selectList(lqw);
    }

    @Override
    public AiModelConfig selectModelById(Long id) {
        return modelConfigMapper.selectById(id);
    }

    @Override
    public boolean insertModel(AiModelConfig config) {
        if (config.getStatus() == null || config.getStatus().isBlank()) {
            config.setStatus("0");
        }
        if (config.getIsDefault() == null || config.getIsDefault().isBlank()) {
            config.setIsDefault("0");
        }
        return modelConfigMapper.insert(config) > 0;
    }

    @Override
    public boolean updateModel(AiModelConfig config) {
        return modelConfigMapper.updateById(config) > 0;
    }

    @Override
    public boolean deleteModelById(Long id) {
        return modelConfigMapper.deleteById(id) > 0;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean setDefaultModel(Long id) {
        AiModelConfig target = modelConfigMapper.selectById(id);
        if (target == null) {
            return false;
        }
        // 将同类型其他配置全部设为非默认
        modelConfigMapper.update(null, new LambdaUpdateWrapper<AiModelConfig>()
            .eq(AiModelConfig::getModelType, target.getModelType())
            .set(AiModelConfig::getIsDefault, "0"));

        target.setIsDefault("1");
        return modelConfigMapper.updateById(target) > 0;
    }
}
