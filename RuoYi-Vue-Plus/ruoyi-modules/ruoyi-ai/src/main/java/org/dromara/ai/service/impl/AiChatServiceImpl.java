package org.dromara.ai.service.impl;

import cn.hutool.core.util.IdUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.dromara.ai.domain.entity.AiKnowledgeChunk;
import org.dromara.ai.domain.entity.AiChatMessage;
import org.dromara.ai.domain.entity.AiChatSession;
import org.dromara.ai.domain.entity.AiModelConfig;
import org.dromara.ai.domain.entity.AiPrompt;
import org.dromara.ai.mapper.AiPromptMapper;
import org.dromara.ai.mapper.AiChatMessageMapper;
import org.dromara.ai.mapper.AiChatSessionMapper;
import org.dromara.ai.mapper.AiModelConfigMapper;
import org.dromara.ai.service.IAiChatService;
import org.dromara.ai.service.IAiKnowledgeService;
import org.dromara.common.core.domain.PageResult;
import org.dromara.common.core.utils.StringUtils;
import org.dromara.common.mybatis.core.page.PageQuery;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.dromara.common.satoken.utils.LoginHelper;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * AI 对话核心服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiChatServiceImpl implements IAiChatService {

    @Override
    public PageResult<AiChatSession> selectSessionList(AiChatSession session, PageQuery pageQuery) {
        LambdaQueryWrapper<AiChatSession> lqw = new LambdaQueryWrapper<>();
        if (session != null) {
            lqw.like(StringUtils.isNotBlank(session.getTitle()), AiChatSession::getTitle, session.getTitle())
               .eq(session.getUserId() != null, AiChatSession::getUserId, session.getUserId())
               .eq(StringUtils.isNotBlank(session.getStatus()), AiChatSession::getStatus, session.getStatus());
        }
        lqw.ne(AiChatSession::getStatus, "2");
        lqw.orderByDesc(AiChatSession::getUpdateTime);
        Page<AiChatSession> page = sessionMapper.selectPage(pageQuery.build(), lqw);
        return PageResult.build(page.getRecords(), page.getTotal());
    }

    @Override
    public PageResult<AiChatMessage> selectMessageList(AiChatMessage message, PageQuery pageQuery) {
        LambdaQueryWrapper<AiChatMessage> lqw = new LambdaQueryWrapper<>();
        if (message != null) {
            lqw.eq(StringUtils.isNotBlank(message.getSessionId()), AiChatMessage::getSessionId, message.getSessionId())
               .eq(StringUtils.isNotBlank(message.getRole()), AiChatMessage::getRole, message.getRole())
               .eq(StringUtils.isNotBlank(message.getModelName()), AiChatMessage::getModelName, message.getModelName())
               .like(StringUtils.isNotBlank(message.getContent()), AiChatMessage::getContent, message.getContent());
        }
        lqw.orderByDesc(AiChatMessage::getCreateTime);
        Page<AiChatMessage> page = messageMapper.selectPage(pageQuery.build(), lqw);
        return PageResult.build(page.getRecords(), page.getTotal());
    }

    @Override
    public boolean deleteMessageById(Long messageId) {
        return messageMapper.deleteById(messageId) > 0;
    }


    private final AiChatSessionMapper sessionMapper;
    private final AiChatMessageMapper messageMapper;
    private final AiModelConfigMapper modelConfigMapper;
    private final IAiKnowledgeService knowledgeService;
    private final AiPromptMapper promptMapper;
    private final org.dromara.ai.service.IAiUserMemoryService memoryService;

    @Override
    public List<AiChatSession> getUserSessions() {
        Long userId = LoginHelper.getUserId();
        return sessionMapper.selectList(new LambdaQueryWrapper<AiChatSession>()
            .eq(AiChatSession::getUserId, userId)
            .ne(AiChatSession::getStatus, "2")
            .orderByDesc(AiChatSession::getIsPinned)
            .orderByDesc(AiChatSession::getUpdateTime));
    }

    @Override
    public AiChatSession createSession(String title, Long assistantId) {
        Long userId = LoginHelper.getUserId();
        AiChatSession session = new AiChatSession();
        session.setId(IdUtil.fastSimpleUUID());
        session.setUserId(userId);
        session.setAssistantId(assistantId);
        session.setTitle(title != null && !title.isBlank() ? title : "新对话");
        session.setIsPinned("0");
        session.setMessageCount(0);
        session.setStatus("0");
        sessionMapper.insert(session);
        return session;
    }

    @Override
    public boolean deleteSession(String sessionId) {
        Long userId = LoginHelper.getUserId();
        AiChatSession session = sessionMapper.selectById(sessionId);
        if (session != null && session.getUserId().equals(userId)) {
            session.setStatus("2"); // 逻辑删除
            return sessionMapper.updateById(session) > 0;
        }
        return false;
    }

    @Override
    public List<AiChatMessage> getSessionMessages(String sessionId) {
        return messageMapper.selectList(new LambdaQueryWrapper<AiChatMessage>()
            .eq(AiChatMessage::getSessionId, sessionId)
            .orderByAsc(AiChatMessage::getCreateTime));
    }

    @Override
    public SseEmitter streamChat(String sessionId, String userMessage, Long kbId) {
        return streamChat(sessionId, userMessage, kbId, null);
    }

    @Override
    public SseEmitter streamChat(String sessionId, String userMessage, Long kbId, Long modelId) {
        Long userId = LoginHelper.getUserId();
        SseEmitter emitter = new SseEmitter(180_000L); // 3分钟超时

        // 1. 保存用户的提问消息入库
        AiChatMessage userMsg = new AiChatMessage();
        userMsg.setSessionId(sessionId);
        userMsg.setUserId(userId);
        userMsg.setRole("user");
        userMsg.setContent(userMessage);
        userMsg.setStatus("success");
        userMsg.setCreateTime(new Date());
        messageMapper.insert(userMsg);

        // 2. 更新会话信息
        AiChatSession session = sessionMapper.selectById(sessionId);
        if (session != null) {
            session.setLastMessagePreview(userMessage.length() > 50 ? userMessage.substring(0, 50) + "..." : userMessage);
            session.setMessageCount((session.getMessageCount() == null ? 0 : session.getMessageCount()) + 1);
            if ("新对话".equals(session.getTitle())) {
                session.setTitle(userMessage.length() > 15 ? userMessage.substring(0, 15) : userMessage);
            }
            sessionMapper.updateById(session);
        }

        // 3. 异步触发大模型流式调用并 SSE 下发
        CompletableFuture.runAsync(() -> {
            StringBuilder assistantReply = new StringBuilder();
            long startTime = System.currentTimeMillis();
            AiModelConfig config = null;
            String mcpSummary = null;
            String mcpTicketsJson = null;
            String mcpFrom = null;
            String mcpTo = null;
            String mcpDate = null;
            int mcpCount = 0;
            List<AiKnowledgeChunk> ragChunks = null;

            // 0. 获取当前会话的历史消息（不包括刚插入的当前用户消息），用于多轮对话上下文与意图继承
            List<AiChatMessage> history = messageMapper.selectList(new LambdaQueryWrapper<AiChatMessage>()
                .eq(AiChatMessage::getSessionId, sessionId)
                .ne(AiChatMessage::getStatus, "error")
                .ne(userMsg.getId() != null, AiChatMessage::getId, userMsg.getId())
                .orderByAsc(AiChatMessage::getCreateTime));

            // 0.1 构建 Hermes 三层记忆系统快照 (SOUL + USER + MEMORY)
            String hermesSnapshot = null;
            String userProfileForMcp = null;
            try {
                if (memoryService != null) {
                    hermesSnapshot = memoryService.buildHermesSystemSnapshot(userId);
                    userProfileForMcp = memoryService.getEffectiveContent(userId, org.dromara.ai.service.impl.AiUserMemoryServiceImpl.TYPE_USER);
                }
            } catch (Exception ex) {
                log.warn("构建 Hermes 记忆快照异常: {}", ex.getMessage());
            }

            boolean hasTrainHistory = false;
            if (history != null && !history.isEmpty()) {
                for (AiChatMessage h : history) {
                    String hc = h.getContent();
                    if (hc != null && (hc.contains("12306") || hc.contains("车次") || hc.contains("高铁") || hc.contains("火车") || hc.contains("出发城市:"))) {
                        hasTrainHistory = true;
                        break;
                    }
                }
            }

            try {
                // 获取模型配置：若指定了 modelId 则优先使用，否则取默认模型
                if (modelId != null && modelId > 0) {
                    config = modelConfigMapper.selectById(modelId);
                }
                if (config == null) {
                    config = modelConfigMapper.selectOne(new LambdaQueryWrapper<AiModelConfig>()
                        .eq(AiModelConfig::getModelType, "chat")
                        .eq(AiModelConfig::getIsDefault, "1")
                        .last("LIMIT 1"));
                }
                if (config == null) {
                    config = modelConfigMapper.selectOne(new LambdaQueryWrapper<AiModelConfig>()
                        .eq(AiModelConfig::getModelType, "chat")
                        .last("LIMIT 1"));
                }

                // 检查知识库 RAG 增强
                String promptToSend = userMessage;
                if (kbId != null && kbId > 0) {
                    try {
                        ragChunks = knowledgeService.searchChunks(kbId, userMessage, 3, 0.2);
                        if (ragChunks != null && !ragChunks.isEmpty()) {
                            StringBuilder ctx = new StringBuilder("【已知背景信息与记忆事实】:\n");
                            for (int i = 0; i < ragChunks.size(); i++) {
                                AiKnowledgeChunk rc = ragChunks.get(i);
                                ctx.append(i + 1).append(". ");
                                if ("qa".equalsIgnoreCase(rc.getChunkType()) && rc.getQuestion() != null) {
                                    ctx.append("记忆问答: ").append(rc.getQuestion()).append(" => ").append(rc.getContent()).append("\n\n");
                                } else {
                                    ctx.append(rc.getContent()).append("\n\n");
                                }
                            }
                            String ragCustomPrompt = null;
                            try {
                                if (promptMapper != null) {
                                    AiPrompt p = promptMapper.selectOne(new LambdaQueryWrapper<AiPrompt>()
                                        .eq(AiPrompt::getAct, "rag_qa")
                                        .eq(AiPrompt::getStatus, "0")
                                        .last("LIMIT 1"));
                                    if (p != null && StringUtils.isNotBlank(p.getContent())) {
                                        ragCustomPrompt = p.getContent().trim();
                                    }
                                }
                            } catch (Exception ignored) {}

                            if (StringUtils.isNotBlank(ragCustomPrompt)) {
                                ctx.append("【角色定位与系统要求】:\n").append(ragCustomPrompt).append("\n\n");
                            } else {
                                ctx.append("【回答核心要求】:\n")
                                   .append("1. 你是用户的贴心私人专属助理，请直接、自然地回答用户，就像你本身就熟知这些事实一样。\n")
                                   .append("2. 绝对严禁出现“根据知识库”、“根据参考内容”、“根据记录”、“文档中显示”等生硬机械的字眼！直接给出自然答案即可。\n\n");
                            }

                            ctx.append("【特别提醒】：请直接作答，严禁出现“根据知识库”、“根据记录”等字眼！\n\n").append("【用户问题】:\n").append(userMessage);
                            promptToSend = ctx.toString();
                        }
                    } catch (Exception e) {
                        log.warn("知识库向量检索异常: {}", e.getMessage());
                    }
                }

                // 12306 MCP 智能意图识别与实时查票增强 (结合会话多轮历史继承)
                boolean shouldQueryTrain = isTrainQuery(userMessage) || (hasTrainHistory && looksLikeTrainFollowup(userMessage));
                if (shouldQueryTrain) {
                    try {
                        String mcpResp = callMcpTrainQuery(userMessage, history, userProfileForMcp);
                        if (StringUtils.isNotBlank(mcpResp)) {
                            cn.hutool.json.JSONObject mcpObj = cn.hutool.json.JSONUtil.parseObj(mcpResp);
                            if (mcpObj.getBool("success", false)) {
                                mcpFrom = mcpObj.getStr("from");
                                mcpTo = mcpObj.getStr("to");
                                mcpDate = mcpObj.getStr("date");
                                mcpCount = mcpObj.getInt("count", 0);
                                boolean isScheduleRef = mcpObj.getBool("scheduleReference", false);
                                String saleOpensOn = mcpObj.getStr("saleOpensOn");
                                String transferHub = mcpObj.getStr("transferHub");
                                boolean isTransfer = mcpObj.getBool("isTransfer", false);

                                cn.hutool.json.JSONArray tickets = mcpObj.getJSONArray("tickets");
                                if (tickets != null && !tickets.isEmpty()) {
                                    // 仅保留最精选车次传递给大模型，避免冗余
                                    cn.hutool.json.JSONArray topTickets = new cn.hutool.json.JSONArray();
                                    for (int i = 0; i < Math.min(tickets.size(), 6); i++) {
                                        topTickets.add(tickets.getJSONObject(i));
                                    }
                                    mcpTicketsJson = topTickets.toString();
                                    StringBuilder tb = new StringBuilder();
                                    if (isScheduleRef) {
                                        tb.append("【特别提醒：出行日期（").append(mcpDate).append("）尚未到达 12306 预售期，预计 ").append(saleOpensOn).append(" 起正式放票。已为您按近期相同星期几的官方正式运行时刻表智能推算排班】:\n");
                                    } else {
                                        tb.append("【已为您自动调用 12306 MCP 官方工具查询实时列车数据】:\n");
                                    }
                                    tb.append("出发城市: ").append(mcpFrom).append("，到达城市: ").append(mcpTo).append("，日期: ").append(mcpDate)
                                      .append("，检索到共 ").append(mcpCount).append(" 趟列车方案。精选推荐车次如下：\n\n");
                                    if (isTransfer && StringUtils.isNotBlank(transferHub)) {
                                        tb.append("（注：部分方案已智能匹配经由「").append(transferHub).append("」的中转联程路线，换乘时间充裕）\n\n");
                                    }
                                    for (int i = 0; i < Math.min(tickets.size(), 8); i++) {
                                        cn.hutool.json.JSONObject t = tickets.getJSONObject(i);
                                        tb.append(i + 1).append(". 车次 ").append(t.getStr("trainCode")).append(": ")
                                          .append(t.getJSONObject("from").getStr("name")).append(" (").append(t.getStr("departureAt").substring(11, 16)).append(") -> ")
                                          .append(t.getJSONObject("to").getStr("name")).append(" (").append(t.getStr("arrivalAt").substring(11, 16)).append(")，历时 ")
                                          .append(t.getInt("durationMinutes") / 60).append("小时").append(t.getInt("durationMinutes") % 60).append("分");
                                        cn.hutool.json.JSONArray seats = t.getJSONArray("seats");
                                        if (seats != null) {
                                            tb.append("，余票席别: [");
                                            for (int s = 0; s < seats.size(); s++) {
                                                cn.hutool.json.JSONObject seat = seats.getJSONObject(s);
                                                tb.append(seat.getStr("kind")).append(": ").append(seat.getStr("rawLabel"));
                                                if (seat.containsKey("priceMinor")) {
                                                    tb.append("(").append(seat.getInt("priceMinor") / 100).append("元)");
                                                }
                                                if (s < seats.size() - 1) tb.append(", ");
                                            }
                                            tb.append("]");
                                        }
                                        tb.append("\n");
                                    }
                                    mcpSummary = tb.toString();
                                }
                            }
                        }
                    } catch (Exception e) {
                        log.warn("调用 12306 MCP 查票异常: {}", e.getMessage());
                    }
                }

                // 组装最终给大模型的 Prompt (优先动态读取「提示词管理」中已配置的 travel_expert 模板)
                if (mcpSummary != null) {
                    StringBuilder fullPrompt = new StringBuilder();
                    fullPrompt.append(mcpSummary).append("\n");

                    String travelCustomPrompt = null;
                    try {
                        if (promptMapper != null) {
                            AiPrompt p = promptMapper.selectOne(new LambdaQueryWrapper<AiPrompt>()
                                .eq(AiPrompt::getAct, "travel_expert")
                                .eq(AiPrompt::getStatus, "0")
                                .last("LIMIT 1"));
                            if (p != null && StringUtils.isNotBlank(p.getContent())) {
                                travelCustomPrompt = p.getContent().trim();
                            }
                        }
                    } catch (Exception ex) {
                        log.warn("读取 12306 出行提示词配置异常: {}", ex.getMessage());
                    }

                    if (StringUtils.isNotBlank(travelCustomPrompt)) {
                        fullPrompt.append("【系统角色与指导要求 (提示词管理配置)】:\n").append(travelCustomPrompt).append("\n\n");
                    } else {
                        fullPrompt.append("【回答核心要求】:\n")
                                  .append("1. 回复必须精炼克制，总字数严格控制在 50~80 字以内，切忌寒暄套话或繁杂逐趟罗列！\n")
                                  .append("2. 仅用一两句话精简点评推荐的 2~3 趟核心车次（如耗时最短车次、优选早晚车），具体各席别票价经停已由下方卡片完美展示，无需在正文重复列出。\n\n");
                    }

                    fullPrompt.append("【用户原始问题】:\n").append(userMessage).append("\n\n")
                              .append("【卡片数据输出约定】:\n")
                              .append("严格在回答最末尾输出车次 JSON 代码块供前端卡片引擎提取展示：\n")
                              .append("```json\n").append(mcpTicketsJson).append("\n```\n");
                    promptToSend = fullPrompt.toString();
                }

                if (config == null || "YOUR_DEEPSEEK_API_KEY".equals(config.getApiKey()) || config.getApiKey() == null) {
                    // 若未配置有效云端 Key，输出友好的快速回显打字机效果并提醒配置
                    StringBuilder tipBuilder = new StringBuilder();
                    if (mcpSummary != null) {
                        tipBuilder.append(mcpSummary).append("\n\n```json\n").append(mcpTicketsJson).append("\n```\n");
                    } else if (ragChunks != null && !ragChunks.isEmpty()) {
                        tipBuilder.append("【AI 知识库 RAG 检索命中】已通过 pgvector 向量检索到 ").append(ragChunks.size()).append(" 条高相关切片：\n\n");
                        for (int i = 0; i < ragChunks.size(); i++) {
                            tipBuilder.append("➤ 知识片段 ").append(i + 1).append(" (相似度: ").append(ragChunks.get(i).getScore()).append("):\n")
                                      .append(ragChunks.get(i).getContent()).append("\n\n");
                        }
                        tipBuilder.append("【智能归纳提示】在后台「模型管理」填入您的 DeepSeek/OpenAI API Key，即可由大模型进行深度语义润色与智能综合回答。\n");
                    } else {
                        tipBuilder.append("【AI 助手已就绪】当前服务端已成功连通 PostgreSQL 向量库与 Redis！\n")
                            .append("请在后台「模型管理」中填入您的 DeepSeek/OpenAI API Key，即可开启完整的智能对话与知识库 RAG 检索。\n\n")
                            .append("您的提问已成功双向持久化落库，会话 ID: `").append(sessionId).append("`。");
                    }
                    String tip = tipBuilder.toString();
                    
                    for (char c : tip.toCharArray()) {
                        try {
                            emitter.send(SseEmitter.event().data(String.valueOf(c)));
                        } catch (Exception ignored) {
                            break;
                        }
                        assistantReply.append(c);
                        Thread.sleep(15);
                    }
                    try {
                        emitter.send(SseEmitter.event().name("done").data("[DONE]"));
                        emitter.complete();
                    } catch (Exception ignored) {}
                } else {
                    // 调用兼容 OpenAI 协议的流式接口 (DeepSeek / OpenAI 等)
                    callOpenAiCompatibleStream(config, hermesSnapshot, history, promptToSend, emitter, assistantReply);
                }

            } catch (Exception e) {
                log.error("流式调用大模型失败", e);
                try {
                    emitter.send(SseEmitter.event().name("error").data("生成失败: " + e.getMessage()));
                    emitter.completeWithError(e);
                } catch (Exception ignored) {
                }
            } finally {
                // 4. 助手回答落库 (只要有生成内容均完整落库持久化)
                if (assistantReply.length() > 0) {
                    try {
                        AiChatMessage assistantMsg = new AiChatMessage();
                        assistantMsg.setSessionId(sessionId);
                        assistantMsg.setUserId(userId);
                        assistantMsg.setRole("assistant");
                        assistantMsg.setContent(assistantReply.toString());
                        assistantMsg.setModelName(config != null ? config.getModelName() : "mock-assistant");
                        assistantMsg.setResponseTimeMs((int) (System.currentTimeMillis() - startTime));
                        assistantMsg.setStatus("success");
                        assistantMsg.setCreateTime(new Date());
                        if (mcpSummary != null) {
                            assistantMsg.setCitations("[{\"type\":\"mcp:12306\",\"from\":\"" + mcpFrom + "\",\"to\":\"" + mcpTo + "\",\"date\":\"" + mcpDate + "\",\"count\":" + mcpCount + "}]");
                        } else if (ragChunks != null && !ragChunks.isEmpty()) {
                            assistantMsg.setCitations(cn.hutool.json.JSONUtil.toJsonStr(ragChunks));
                        }
                        messageMapper.insert(assistantMsg);
                    } catch (Exception ex) {
                        log.error("助手回答持久化落库失败: {}", ex.getMessage());
                    }
                    // 5. 触发 Hermes 异步记忆提炼与自主反思学习 (Async Memory Reflection & Learning)
                    try {
                        if (memoryService != null && config != null) {
                            memoryService.asyncReflectAndLearn(userId, userMessage, assistantReply.toString(), config);
                        }
                    } catch (Exception ex) {
                        log.warn("Hermes 异步反思提炼异常: {}", ex.getMessage());
                    }
                }
            }
        });

        return emitter;
    }

    private boolean isTrainQuery(String msg) {
        if (StringUtils.isBlank(msg)) return false;
        String lower = msg.toLowerCase();
        return lower.contains("火车") || lower.contains("高铁") || lower.contains("动车") ||
               lower.contains("车票") || lower.contains("12306") || lower.contains("列车") ||
               lower.contains("时刻表") || lower.contains("余票") || lower.contains("动卧") ||
               lower.contains("硬卧") || lower.contains("软卧") || lower.contains("商务座") ||
               lower.contains("二等座") || lower.contains("一等座") ||
               ((lower.contains("查票") || lower.contains("到") || lower.contains("去") || lower.contains("至")) && (lower.contains("票") || lower.contains("车") || lower.contains("方案") || lower.contains("时刻"))) ||
               java.util.regex.Pattern.compile("[\\u4e00-\\u9fa5]{2,6}(?:到|至|去)[\\u4e00-\\u9fa5]{2,6}").matcher(msg).find();
    }

    private boolean looksLikeTrainFollowup(String msg) {
        if (StringUtils.isBlank(msg)) return false;
        String lower = msg.toLowerCase();
        return lower.contains("出发") || lower.contains("票") || lower.contains("车") ||
               lower.contains("点") || lower.contains("早") || lower.contains("晚") ||
               lower.contains("快") || lower.contains("便宜") || lower.contains("哪个") ||
               lower.contains("方案") || lower.contains("号") || lower.contains("日") ||
               lower.contains("次") || lower.contains("转") || lower.contains("改") ||
               lower.contains("候补") || lower.contains("卧") || lower.contains("二等") ||
               lower.contains("一等") || lower.contains("商务") || lower.contains("时间") ||
               lower.contains("几点") || lower.contains("推荐") || lower.contains("定") || lower.contains("订") ||
               lower.contains("下午") || lower.contains("上午") || lower.contains("中午") || lower.contains("到达") ||
               lower.contains("班次") || lower.contains("站");
    }

    private String callMcpTrainQuery(String userMessage, List<AiChatMessage> history, String userProfile) {
        String[] targetUrls = new String[] {
            "http://assistant-server:3000/internal/train/query",
            "http://127.0.0.1:3000/internal/train/query",
            "http://172.17.0.1:3000/internal/train/query"
        };
        for (String targetUrl : targetUrls) {
            try {
                URL url = new URL(targetUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(20000);
                conn.setDoOutput(true);

                cn.hutool.json.JSONObject reqObj = new cn.hutool.json.JSONObject();
                reqObj.set("userMessage", userMessage);
                if (StringUtils.isNotBlank(userProfile)) {
                    reqObj.set("userProfile", userProfile);
                }
                if (history != null && !history.isEmpty()) {
                    cn.hutool.json.JSONArray hist = new cn.hutool.json.JSONArray();
                    int start = Math.max(0, history.size() - 6);
                    for (int i = start; i < history.size(); i++) {
                        AiChatMessage hm = history.get(i);
                        cn.hutool.json.JSONObject ho = new cn.hutool.json.JSONObject();
                        ho.set("role", hm.getRole());
                        String txt = hm.getContent();
                        if (txt.contains("```json")) {
                            txt = txt.substring(0, txt.indexOf("```json")).trim();
                        }
                        ho.set("text", txt);
                        hist.add(ho);
                    }
                    reqObj.set("history", hist);
                }

                String payload = reqObj.toString();
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(payload.getBytes(StandardCharsets.UTF_8));
                }

                if (conn.getResponseCode() == 200) {
                    try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                        StringBuilder sb = new StringBuilder();
                        String line;
                        while ((line = reader.readLine()) != null) {
                            sb.append(line);
                        }
                        return sb.toString();
                    }
                }
            } catch (Exception ignored) {
            }
        }
        return null;
    }

    private void callOpenAiCompatibleStream(
        AiModelConfig config,
        String hermesSnapshot,
        List<AiChatMessage> history,
        String message,
        SseEmitter emitter,
        StringBuilder assistantReply
    ) throws Exception {
        String baseUrl = config.getBaseUrl();
        if (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        }
        URL url = new URL(baseUrl + "/chat/completions");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Authorization", "Bearer " + config.getApiKey());
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Accept", "text/event-stream");
        conn.setDoOutput(true);

        // 构建包含前序对话历史与 Hermes 三层记忆快照的完整 messages 数组
        cn.hutool.json.JSONArray messagesArray = new cn.hutool.json.JSONArray();

        // 1. 注入 Hermes 三层记忆冻结快照 (SOUL + USER + MEMORY) 作为系统第一级指令
        if (StringUtils.isNotBlank(hermesSnapshot)) {
            cn.hutool.json.JSONObject sysMsg = new cn.hutool.json.JSONObject();
            sysMsg.set("role", "system");
            sysMsg.set("content", hermesSnapshot);
            messagesArray.add(sysMsg);
        }

        // 2. 注入多轮对话历史
        if (history != null && !history.isEmpty()) {
            int start = Math.max(0, history.size() - 8);
            for (int i = start; i < history.size(); i++) {
                AiChatMessage h = history.get(i);
                if ("user".equals(h.getRole()) || "assistant".equals(h.getRole())) {
                    String content = h.getContent();
                    if ("assistant".equals(h.getRole()) && content.contains("```json")) {
                        content = content.substring(0, content.indexOf("```json")).trim();
                    }
                    if (StringUtils.isNotBlank(content)) {
                        cn.hutool.json.JSONObject msgObj = new cn.hutool.json.JSONObject();
                        msgObj.set("role", h.getRole());
                        msgObj.set("content", content);
                        messagesArray.add(msgObj);
                    }
                }
            }
        }

        // 追加当前轮提问
        cn.hutool.json.JSONObject currentMsg = new cn.hutool.json.JSONObject();
        currentMsg.set("role", "user");
        currentMsg.set("content", message);
        messagesArray.add(currentMsg);

        cn.hutool.json.JSONObject requestBody = new cn.hutool.json.JSONObject();
        requestBody.set("model", config.getModelName());
        requestBody.set("stream", true);
        requestBody.set("messages", messagesArray);

        String jsonPayload = requestBody.toString();

        try (OutputStream os = conn.getOutputStream()) {
            os.write(jsonPayload.getBytes(StandardCharsets.UTF_8));
        }

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("data: ")) {
                    String data = line.substring(6).trim();
                    if ("[DONE]".equals(data)) {
                        try {
                            emitter.send(SseEmitter.event().name("done").data("[DONE]"));
                        } catch (Exception ignored) {}
                        break;
                    }
                    try {
                        cn.hutool.json.JSONObject obj = cn.hutool.json.JSONUtil.parseObj(data);
                        cn.hutool.json.JSONArray choices = obj.getJSONArray("choices");
                        if (choices != null && !choices.isEmpty()) {
                            cn.hutool.json.JSONObject delta = choices.getJSONObject(0).getJSONObject("delta");
                            if (delta != null && delta.containsKey("content")) {
                                String content = delta.getStr("content");
                                if (content != null) {
                                    assistantReply.append(content);
                                    try {
                                        emitter.send(SseEmitter.event().data(content));
                                    } catch (Exception sseEx) {
                                        log.warn("SSE 客户端连接中断: {}", sseEx.getMessage());
                                        break;
                                    }
                                }
                            }
                        }
                    } catch (Exception ignored) {
                    }
                }
            }
        }
        try {
            emitter.complete();
        } catch (Exception ignored) {}
    }
}
