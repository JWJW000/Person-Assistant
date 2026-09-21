package org.dromara.ai.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.dromara.ai.domain.entity.AiModelConfig;
import org.dromara.ai.domain.entity.AiUserMemory;
import org.dromara.ai.mapper.AiUserMemoryMapper;
import org.dromara.ai.service.IAiUserMemoryService;
import org.dromara.common.core.utils.StringUtils;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * Hermes 三层记忆系统实现
 *
 * @author ruoyi
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiUserMemoryServiceImpl implements IAiUserMemoryService {

    private final AiUserMemoryMapper memoryMapper;

    public static final String TYPE_SOUL = "soul";
    public static final String TYPE_USER = "user_profile";
    public static final String TYPE_MEMORY = "fact_lessons";

    private static final String DEFAULT_SOUL =
        "你是高效、极简、高信息密度的个人专属 AI 助理。\n" +
        "【行为准则】:\n" +
        "1. 直接给出客观结论与最优方案，严禁废话寒暄，杜绝“我明白了/好的”、“根据知识库/根据记录”等机械表述。\n" +
        "2. 深度结合用户的专属偏好档案与长期事实，给出符合其习惯的个性化回答。";

    private static final String DEFAULT_USER =
        "【用户画像与偏好档案 (USER.md)】\n" +
        "- 常用常驻城市：北京\n" +
        "- 交通席别偏好：高铁二等座为主，长途优先考虑动卧\n" +
        "- 出行时间偏好：工作日习惯午后（12:00之后）出发\n" +
        "- 沟通偏好：极简精炼、先结论后列表、拒绝多余套话";

    private static final String DEFAULT_FACTS =
        "【环境事实与避坑经验 (MEMORY.md)】\n" +
        "- 女朋友是王宇静\n" +
        "- 北京南站进站安检人流密集，建议预留至少 25 分钟\n" +
        "- 跨日期出行优先推荐直达高铁，中转只在无直达或耗时更优时推荐";

    @Override
    public String getEffectiveContent(Long userId, String memoryType) {
        if (userId == null) {
            userId = 1L;
        }
        AiUserMemory mem = memoryMapper.selectOne(new LambdaQueryWrapper<AiUserMemory>()
            .eq(AiUserMemory::getUserId, userId)
            .eq(AiUserMemory::getMemoryType, memoryType)
            .last("LIMIT 1"));
        if (mem != null && StringUtils.isNotBlank(mem.getContent())) {
            return mem.getContent().trim();
        }
        // 若当前用户未单独配置，查系统管理员（userId=1）的模板兜底
        if (!Long.valueOf(1L).equals(userId)) {
            AiUserMemory adminMem = memoryMapper.selectOne(new LambdaQueryWrapper<AiUserMemory>()
                .eq(AiUserMemory::getUserId, 1L)
                .eq(AiUserMemory::getMemoryType, memoryType)
                .last("LIMIT 1"));
            if (adminMem != null && StringUtils.isNotBlank(adminMem.getContent())) {
                return adminMem.getContent().trim();
            }
        }
        return getDefaultContent(memoryType);
    }

    private String getDefaultContent(String memoryType) {
        if (TYPE_SOUL.equals(memoryType)) return DEFAULT_SOUL;
        if (TYPE_USER.equals(memoryType)) return DEFAULT_USER;
        if (TYPE_MEMORY.equals(memoryType)) return DEFAULT_FACTS;
        return "";
    }

    @Override
    public Map<String, Object> getUserThreeLayerMemory(Long userId) {
        if (userId == null) userId = 1L;
        Map<String, Object> result = new HashMap<>();
        result.put("soul", getEffectiveContent(userId, TYPE_SOUL));
        result.put("userProfile", getEffectiveContent(userId, TYPE_USER));
        result.put("factLessons", getEffectiveContent(userId, TYPE_MEMORY));
        result.put("userId", userId);
        result.put("updateTime", new Date());
        return result;
    }

    @Override
    public void saveOrUpdateMemory(Long userId, String memoryType, String content) {
        if (userId == null) userId = 1L;
        AiUserMemory mem = memoryMapper.selectOne(new LambdaQueryWrapper<AiUserMemory>()
            .eq(AiUserMemory::getUserId, userId)
            .eq(AiUserMemory::getMemoryType, memoryType)
            .last("LIMIT 1"));
        if (mem != null) {
            mem.setContent(content);
            mem.setUpdateTime(LocalDateTime.now());
            memoryMapper.updateById(mem);
        } else {
            mem = new AiUserMemory();
            mem.setUserId(userId);
            mem.setMemoryType(memoryType);
            mem.setContent(content);
            mem.setStatus("0");
            mem.setCreateTime(LocalDateTime.now());
            mem.setUpdateTime(LocalDateTime.now());
            memoryMapper.insert(mem);
        }
        log.info("[Hermes 记忆] 用户 {} 更新 {} 成功", userId, memoryType);
    }

    @Override
    public void clearMemory(Long userId, String memoryType) {
        if (userId == null) userId = 1L;
        String defaultVal = getDefaultContent(memoryType);
        saveOrUpdateMemory(userId, memoryType, defaultVal);
    }

    @Override
    public String buildHermesSystemSnapshot(Long userId) {
        String soul = getEffectiveContent(userId, TYPE_SOUL);
        String userProfile = getEffectiveContent(userId, TYPE_USER);
        String factLessons = getEffectiveContent(userId, TYPE_MEMORY);

        StringBuilder sb = new StringBuilder();
        if (StringUtils.isNotBlank(soul)) {
            sb.append("【角色灵魂与系统准则 (SOUL.md)】:\n").append(soul).append("\n\n");
        }
        if (StringUtils.isNotBlank(userProfile)) {
            sb.append("【用户专属偏好档案 (USER.md)】:\n").append(userProfile).append("\n\n");
        }
        if (StringUtils.isNotBlank(factLessons)) {
            sb.append("【环境事实与避坑经验 (MEMORY.md)】:\n").append(factLessons).append("\n\n");
        }
        return sb.toString().trim();
    }

    @Override
    public void asyncReflectAndLearn(Long userId, String userMessage, String assistantReply, AiModelConfig config) {
        if (userId == null || config == null || StringUtils.isBlank(userMessage)) return;

        // 过滤无意义的超短文本
        String cleanMsg = userMessage.trim();
        if (cleanMsg.length() < 4) return;

        // 快速启发式过滤：仅在用户表述包含身份、偏好、习惯、禁忌或决策意图时触发 LLM 提炼
        boolean hasIndicator = cleanMsg.contains("喜欢") || cleanMsg.contains("偏好") || cleanMsg.contains("习惯") ||
                               cleanMsg.contains("以后") || cleanMsg.contains("不要") || cleanMsg.contains("不坐") ||
                               cleanMsg.contains("记住") || cleanMsg.contains("我是") || cleanMsg.contains("我家") ||
                               cleanMsg.contains("常住") || cleanMsg.contains("常去") || cleanMsg.contains("女友") ||
                               cleanMsg.contains("女朋友") || cleanMsg.contains("选") || cleanMsg.contains("定") ||
                               cleanMsg.contains("出发") || cleanMsg.contains("买") || cleanMsg.contains("去") ||
                               cleanMsg.contains("到") || cleanMsg.contains("改") || cleanMsg.contains("换");
        if (!hasIndicator) return;

        CompletableFuture.runAsync(() -> {
            try {
                String curUser = getEffectiveContent(userId, TYPE_USER);
                String curFacts = getEffectiveContent(userId, TYPE_MEMORY);

                String reflectionPrompt = """
                    你是一个专业的个人长期记忆提炼与管理者 (遵循 Hermes Agent 三层记忆架构)。
                    请分析以下这一轮用户与助手的对话，判断用户是否表露了具有【长期留存价值】的个人事实、习惯偏好、身份信息或交互禁忌。

                    【当前对话】:
                    用户: %s
                    助手: %s

                    【现有用户偏好档案 (USER.md)】:
                    %s

                    【现有环境事实经验 (MEMORY.md)】:
                    %s

                    规则要求：
                    1. 仅提炼可跨会话复用的长期信息（如出行习惯、时间偏好、席别偏好、核心人际关系、工作或生活偏好）。切勿记录临时的单次车次或一次性琐碎信息。
                    2. 若无任何新的长期信息，必须且只输出：NONE
                    3. 若有，请输出严格合法的 JSON 对象（切勿输出任何 markdown 代码块或多余文字）：
                    {
                      "target": "USER",
                      "content": "精简的一句话记忆（20字以内，如：偏好下午出发）"
                    }
                    其中 target 只能为 "USER"（代表用户习惯偏好）或 "MEMORY"（代表环境事实或避坑教训）。
                    """.formatted(cleanMsg, assistantReply.length() > 300 ? assistantReply.substring(0, 300) : assistantReply, curUser, curFacts);

                String llmResp = callOpenAiSync(config, null, reflectionPrompt);
                if (StringUtils.isBlank(llmResp) || "NONE".equalsIgnoreCase(llmResp.trim())) {
                    return;
                }

                // 清理代码块包裹
                String jsonStr = llmResp.trim();
                if (jsonStr.contains("```json")) {
                    jsonStr = jsonStr.substring(jsonStr.indexOf("```json") + 7);
                    if (jsonStr.contains("```")) {
                        jsonStr = jsonStr.substring(0, jsonStr.indexOf("```"));
                    }
                } else if (jsonStr.contains("```")) {
                    jsonStr = jsonStr.substring(jsonStr.indexOf("```") + 3);
                    if (jsonStr.contains("```")) {
                        jsonStr = jsonStr.substring(0, jsonStr.indexOf("```"));
                    }
                }
                jsonStr = jsonStr.trim();

                if (!jsonStr.startsWith("{") || !jsonStr.endsWith("}")) {
                    return;
                }

                cn.hutool.json.JSONObject obj = cn.hutool.json.JSONUtil.parseObj(jsonStr);
                String target = obj.getStr("target", "USER");
                String content = obj.getStr("content");

                if (StringUtils.isNotBlank(content)) {
                    String memType = "MEMORY".equalsIgnoreCase(target) ? TYPE_MEMORY : TYPE_USER;
                    String existing = getEffectiveContent(userId, memType);

                    // 避免简单重复
                    if (!existing.contains(content)) {
                        String updated = existing + "\n- " + content;
                        saveOrUpdateMemory(userId, memType, updated);
                        log.info("[Hermes 记忆学习] 为用户 {} 沉淀新记忆 [{}]: {}", userId, memType, content);

                        // 当记忆过长时自动触发压缩整理
                        if (updated.length() > 900) {
                            consolidateMemory(userId, memType, config);
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("[Hermes 记忆学习] 异步提炼异常: {}", e.getMessage());
            }
        });
    }

    @Override
    public void consolidateMemory(Long userId, String memoryType, AiModelConfig config) {
        try {
            String current = getEffectiveContent(userId, memoryType);
            if (StringUtils.isBlank(current)) return;

            String prompt = """
                你是一个专业的长期记忆压缩与整合引擎 (Hermes Consolidation)。
                以下是用户的长期记忆条目，因容量接近上限，请对其进行合并去重、淘汰过时或冗余条目、提炼更精炼的表述。
                保持紧凑的 Markdown 无序列表格式（每个条目不超过 25 字，总条目严格控制在 5~8 条以内）。
                直接输出整理后的列表，切勿包含任何多余的前言、解释或思考过程。

                【待压缩记忆内容】:
                %s
                """.formatted(current);

            String compressed = callOpenAiSync(config, null, prompt);
            if (StringUtils.isNotBlank(compressed) && compressed.contains("- ")) {
                saveOrUpdateMemory(userId, memoryType, compressed.trim());
                log.info("[Hermes 记忆压缩] 为用户 {} 完成 {} 压缩整合", userId, memoryType);
            }
        } catch (Exception e) {
            log.warn("[Hermes 记忆压缩] 执行整合异常: {}", e.getMessage());
        }
    }

    private String callOpenAiSync(AiModelConfig config, String systemPrompt, String userPrompt) throws Exception {
        String baseUrl = config.getBaseUrl();
        if (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        }
        URL url = new URL(baseUrl + "/chat/completions");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Authorization", "Bearer " + config.getApiKey());
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(20000);
        conn.setDoOutput(true);

        cn.hutool.json.JSONArray msgs = new cn.hutool.json.JSONArray();
        if (StringUtils.isNotBlank(systemPrompt)) {
            msgs.add(new cn.hutool.json.JSONObject().set("role", "system").set("content", systemPrompt));
        }
        msgs.add(new cn.hutool.json.JSONObject().set("role", "user").set("content", userPrompt));

        cn.hutool.json.JSONObject req = new cn.hutool.json.JSONObject();
        req.set("model", config.getModelName());
        req.set("stream", false);
        req.set("messages", msgs);

        try (OutputStream os = conn.getOutputStream()) {
            os.write(req.toString().getBytes(StandardCharsets.UTF_8));
        }

        int respCode = conn.getResponseCode();
        if (respCode >= 200 && respCode < 300) {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                cn.hutool.json.JSONObject respObj = cn.hutool.json.JSONUtil.parseObj(sb.toString());
                cn.hutool.json.JSONArray choices = respObj.getJSONArray("choices");
                if (choices != null && !choices.isEmpty()) {
                    return choices.getJSONObject(0).getJSONObject("message").getStr("content");
                }
            }
        }
        return null;
    }
}
