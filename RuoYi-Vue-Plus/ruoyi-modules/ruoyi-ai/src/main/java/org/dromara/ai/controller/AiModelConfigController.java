package org.dromara.ai.controller;

import lombok.RequiredArgsConstructor;
import org.dromara.ai.domain.entity.AiModelConfig;
import org.dromara.ai.service.IAiModelConfigService;
import org.dromara.common.core.domain.PageResult;
import org.dromara.common.core.domain.R;
import org.dromara.common.mybatis.core.page.PageQuery;
import org.dromara.common.web.core.BaseController;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * AI 模型供应商与接口配置控制器
 *
 * @author ruoyi
 */
@Validated
@RestController
@RequestMapping("/ai/model")
@RequiredArgsConstructor
public class AiModelConfigController extends BaseController {

    private final IAiModelConfigService modelConfigService;

    /**
     * 分页查询模型配置列表
     */
    @GetMapping("/list")
    public R<PageResult<AiModelConfig>> list(AiModelConfig config, PageQuery pageQuery) {
        return R.ok(modelConfigService.selectModelList(config, pageQuery));
    }

    /**
     * 查询所有可用模型列表 (支持根据 modelType=chat/embedding 过滤)
     */
    @GetMapping("/all")
    public R<List<AiModelConfig>> listAll(@RequestParam(required = false) String modelType) {
        return R.ok(modelConfigService.selectModelListAll(modelType));
    }

    /**
     * 获取模型配置详情
     */
    @GetMapping("/{id}")
    public R<AiModelConfig> getInfo(@PathVariable Long id) {
        return R.ok(modelConfigService.selectModelById(id));
    }

    /**
     * 新增模型配置
     */
    @PostMapping
    public R<Void> add(@RequestBody AiModelConfig config) {
        return toAjax(modelConfigService.insertModel(config));
    }

    /**
     * 修改模型配置
     */
    @PutMapping
    public R<Void> edit(@RequestBody AiModelConfig config) {
        return toAjax(modelConfigService.updateModel(config));
    }

    /**
     * 删除模型配置
     */
    @DeleteMapping("/{id}")
    public R<Void> remove(@PathVariable Long id) {
        return toAjax(modelConfigService.deleteModelById(id));
    }

    /**
     * 设为默认模型
     */
    @PutMapping("/default/{id}")
    public R<Void> setDefault(@PathVariable Long id) {
        return toAjax(modelConfigService.setDefaultModel(id));
    }
}
