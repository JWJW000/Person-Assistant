package org.dromara.ai.controller;

import lombok.RequiredArgsConstructor;
import org.dromara.ai.service.IAiUserMemoryService;
import org.dromara.common.core.domain.R;
import org.dromara.common.satoken.utils.LoginHelper;
import org.dromara.common.web.core.BaseController;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Hermes 三层记忆系统控制器 (SOUL / USER / MEMORY)
 *
 * @author ruoyi
 */
@Validated
@RestController
@RequestMapping("/ai/memory")
@RequiredArgsConstructor
public class AiUserMemoryController extends BaseController {

    private final IAiUserMemoryService memoryService;

    /**
     * 获取当前登录用户的完整三层记忆 (SOUL, USER, MEMORY)
     */
    @GetMapping("/my")
    public R<Map<String, Object>> getMyMemory() {
        Long userId = LoginHelper.getUserId();
        return R.ok(memoryService.getUserThreeLayerMemory(userId));
    }

    /**
     * 更新指定层级的记忆内容
     */
    @PutMapping("/update")
    public R<Void> updateMemory(@RequestBody Map<String, String> body) {
        Long userId = LoginHelper.getUserId();
        String memoryType = body.get("type");
        String content = body.get("content");
        if (memoryType == null || content == null) {
            return R.fail("记忆类型或内容不能为空");
        }
        memoryService.saveOrUpdateMemory(userId, memoryType, content);
        return R.ok();
    }

    /**
     * 重置指定层级的记忆为默认值
     */
    @DeleteMapping("/clear")
    public R<Void> clearMemory(@RequestParam("type") String memoryType) {
        Long userId = LoginHelper.getUserId();
        memoryService.clearMemory(userId, memoryType);
        return R.ok();
    }

    /**
     * 获取将注入大模型 System Prompt 的 Hermes 冻结快照预览
     */
    @GetMapping("/snapshot")
    public R<String> getSystemSnapshot() {
        Long userId = LoginHelper.getUserId();
        return R.ok(memoryService.buildHermesSystemSnapshot(userId));
    }
}
