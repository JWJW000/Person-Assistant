package org.dromara.ai.service;

import org.dromara.ai.domain.entity.AiPrompt;
import org.dromara.common.core.domain.PageResult;
import org.dromara.common.mybatis.core.page.PageQuery;

import java.util.List;

/**
 * 提示词管理服务接口
 */
public interface IAiPromptService {

    /**
     * 分页查询提示词列表
     */
    PageResult<AiPrompt> selectPromptList(AiPrompt prompt, PageQuery pageQuery);

    /**
     * 查询所有可用提示词列表 (支持按分类过滤)
     */
    List<AiPrompt> selectPromptListAll(String category);

    /**
     * 获取提示词详情
     */
    AiPrompt selectPromptById(Long id);

    /**
     * 新增提示词
     */
    boolean insertPrompt(AiPrompt prompt);

    /**
     * 修改提示词
     */
    boolean updatePrompt(AiPrompt prompt);

    /**
     * 删除提示词
     */
    boolean deletePromptById(Long id);

    /**
     * 变更状态
     */
    boolean changeStatus(Long id, String status);
}
