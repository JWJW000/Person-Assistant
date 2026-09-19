package org.dromara.ai.controller;

import lombok.RequiredArgsConstructor;
import org.dromara.ai.domain.entity.AiPrompt;
import org.dromara.ai.service.IAiPromptService;
import org.dromara.common.core.domain.PageResult;
import org.dromara.common.core.domain.R;
import org.dromara.common.mybatis.core.page.PageQuery;
import org.dromara.common.web.core.BaseController;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * AI 提示词与系统指令模板控制器
 *
 * @author ruoyi
 */
@Validated
@RestController
@RequestMapping("/ai/prompt")
@RequiredArgsConstructor
public class AiPromptController extends BaseController {

    private final IAiPromptService promptService;

    /**
     * 分页查询提示词列表
     */
    @GetMapping("/list")
    public R<PageResult<AiPrompt>> list(AiPrompt prompt, PageQuery pageQuery) {
        return R.ok(promptService.selectPromptList(prompt, pageQuery));
    }

    /**
     * 查询所有可用提示词列表 (支持按分类过滤)
     */
    @GetMapping("/all")
    public R<List<AiPrompt>> listAll(@RequestParam(value = "category", required = false) String category) {
        return R.ok(promptService.selectPromptListAll(category));
    }

    /**
     * 获取提示词详情
     */
    @GetMapping("/{id}")
    public R<AiPrompt> getInfo(@PathVariable("id") Long id) {
        return R.ok(promptService.selectPromptById(id));
    }

    /**
     * 新增提示词
     */
    @PostMapping
    public R<Void> add(@RequestBody AiPrompt prompt) {
        return toAjax(promptService.insertPrompt(prompt));
    }

    /**
     * 修改提示词
     */
    @PutMapping
    public R<Void> edit(@RequestBody AiPrompt prompt) {
        return toAjax(promptService.updatePrompt(prompt));
    }

    /**
     * 删除提示词
     */
    @DeleteMapping("/{id}")
    public R<Void> remove(@PathVariable("id") Long id) {
        return toAjax(promptService.deletePromptById(id));
    }

    /**
     * 修改提示词状态
     */
    @PutMapping("/status")
    public R<Void> changeStatus(@RequestBody AiPrompt prompt) {
        return toAjax(promptService.changeStatus(prompt.getId(), prompt.getStatus()));
    }
}
