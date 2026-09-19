package org.dromara.ai.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.dromara.ai.domain.entity.AiPrompt;
import org.dromara.ai.mapper.AiPromptMapper;
import org.dromara.ai.service.IAiPromptService;
import org.dromara.common.core.domain.PageResult;
import org.dromara.common.core.utils.StringUtils;
import org.dromara.common.mybatis.core.page.PageQuery;
import org.dromara.common.satoken.utils.LoginHelper;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 提示词管理服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiPromptServiceImpl implements IAiPromptService {

    private final AiPromptMapper promptMapper;

    @Override
    public PageResult<AiPrompt> selectPromptList(AiPrompt prompt, PageQuery pageQuery) {
        LambdaQueryWrapper<AiPrompt> lqw = new LambdaQueryWrapper<>();
        if (prompt != null) {
            lqw.like(StringUtils.isNotBlank(prompt.getTitle()), AiPrompt::getTitle, prompt.getTitle())
               .eq(StringUtils.isNotBlank(prompt.getCategory()), AiPrompt::getCategory, prompt.getCategory())
               .eq(StringUtils.isNotBlank(prompt.getStatus()), AiPrompt::getStatus, prompt.getStatus())
               .like(StringUtils.isNotBlank(prompt.getAct()), AiPrompt::getAct, prompt.getAct());
        }
        lqw.orderByAsc(AiPrompt::getSortOrder)
           .orderByDesc(AiPrompt::getUpdateTime);
        Page<AiPrompt> page = promptMapper.selectPage(pageQuery.build(), lqw);
        return PageResult.build(page.getRecords(), page.getTotal());
    }

    @Override
    public List<AiPrompt> selectPromptListAll(String category) {
        LambdaQueryWrapper<AiPrompt> lqw = new LambdaQueryWrapper<>();
        lqw.eq(AiPrompt::getStatus, "0");
        if (StringUtils.isNotBlank(category)) {
            lqw.eq(AiPrompt::getCategory, category);
        }
        lqw.orderByAsc(AiPrompt::getSortOrder)
           .orderByDesc(AiPrompt::getUpdateTime);
        return promptMapper.selectList(lqw);
    }

    @Override
    public AiPrompt selectPromptById(Long id) {
        return promptMapper.selectById(id);
    }

    @Override
    public boolean insertPrompt(AiPrompt prompt) {
        try {
            Long userId = LoginHelper.getUserId();
            prompt.setUserId(userId);
        } catch (Exception ignored) {}
        if (prompt.getSortOrder() == null) {
            prompt.setSortOrder(0);
        }
        if (StringUtils.isBlank(prompt.getStatus())) {
            prompt.setStatus("0");
        }
        if (StringUtils.isBlank(prompt.getIsSystem())) {
            prompt.setIsSystem("0");
        }
        if (StringUtils.isBlank(prompt.getCategory())) {
            prompt.setCategory("通用");
        }
        return promptMapper.insert(prompt) > 0;
    }

    @Override
    public boolean updatePrompt(AiPrompt prompt) {
        return promptMapper.updateById(prompt) > 0;
    }

    @Override
    public boolean deletePromptById(Long id) {
        return promptMapper.deleteById(id) > 0;
    }

    @Override
    public boolean changeStatus(Long id, String status) {
        AiPrompt prompt = new AiPrompt();
        prompt.setId(id);
        prompt.setStatus(status);
        return promptMapper.updateById(prompt) > 0;
    }
}
