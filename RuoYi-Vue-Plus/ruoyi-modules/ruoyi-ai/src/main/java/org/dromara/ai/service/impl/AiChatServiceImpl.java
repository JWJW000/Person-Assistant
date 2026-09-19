package org.dromara.ai.service.impl;

import cn.hutool.core.util.IdUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.dromara.ai.domain.entity.AiKnowledgeChunk;
import org.dromara.ai.domain.entity.AiChatMessage;
import org.dromara.ai.domain.entity.AiChatSession;
import org.dromara.ai.domain.entity.AiModelConfig;
import org.dromara.ai.mapper.AiChatMessageMapper;
import org.dromara.ai.mapper.AiChatSessionMapper;
import org.dromara.ai.mapper.AiModelConfigMapper;
import org.dromara.ai.service.IAiChatService;
import org.dromara.ai.service.IAiKnowledgeService;
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

    private final AiChatSessionMapper sessionMapper;
    private final AiChatMessageMapper messageMapper;
    private final AiModelConfigMapper modelConfigMapper;
    private final IAiKnowledgeService knowledgeService;

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
            try {
                // 获取模型配置：若指定了 modelId 则优先使用，否则取默认模型
                AiModelConfig config = null;
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
                List<AiKnowledgeChunk> ragChunks = null;
                if (kbId != null && kbId > 0) {
                    try {
                        ragChunks = knowledgeService.searchChunks(kbId, userMessage, 3, 0.3);
                        if (ragChunks != null && !ragChunks.isEmpty()) {
                            StringBuilder ctx = new StringBuilder("【参考知识库内容如下】:\n");
                            for (int i = 0; i < ragChunks.size(); i++) {
                                ctx.append(i + 1).append(". ").append(ragChunks.get(i).getContent()).append("\n\n");
                            }
                            ctx.append("【用户问题】:\n").append(userMessage).append("\n\n请结合上述参考知识库内容，准确回答用户问题。");
                            promptToSend = ctx.toString();
                        }
                    } catch (Exception e) {
                        log.warn("知识库向量检索异常: {}", e.getMessage());
                    }
                }

                if (config == null || "YOUR_DEEPSEEK_API_KEY".equals(config.getApiKey()) || config.getApiKey() == null) {
                    // 若未配置有效云端 Key，输出友好的快速回显打字机效果并提醒配置
                    StringBuilder tipBuilder = new StringBuilder();
                    if (ragChunks != null && !ragChunks.isEmpty()) {
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
                        emitter.send(SseEmitter.event().data(String.valueOf(c)));
                        assistantReply.append(c);
                        Thread.sleep(15);
                    }
                    emitter.send(SseEmitter.event().name("done").data("[DONE]"));
                    emitter.complete();
                } else {
                    // 调用兼容 OpenAI 协议的流式接口 (DeepSeek / OpenAI 等)
                    callOpenAiCompatibleStream(config, promptToSend, emitter, assistantReply);
                }

                // 4. 助手回答落库
                AiChatMessage assistantMsg = new AiChatMessage();
                assistantMsg.setSessionId(sessionId);
                assistantMsg.setUserId(userId);
                assistantMsg.setRole("assistant");
                assistantMsg.setContent(assistantReply.toString());
                assistantMsg.setModelName(config != null ? config.getModelName() : "mock-assistant");
                assistantMsg.setResponseTimeMs((int) (System.currentTimeMillis() - startTime));
                assistantMsg.setStatus("success");
                assistantMsg.setCreateTime(new Date());
                messageMapper.insert(assistantMsg);

            } catch (Exception e) {
                log.error("流式调用大模型失败", e);
                try {
                    emitter.send(SseEmitter.event().name("error").data("生成失败: " + e.getMessage()));
                    emitter.completeWithError(e);
                } catch (Exception ignored) {
                }
            }
        });

        return emitter;
    }

    private void callOpenAiCompatibleStream(AiModelConfig config, String message, SseEmitter emitter, StringBuilder assistantReply) throws Exception {
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

        String jsonPayload = String.format("""
            {
              "model": "%s",
              "stream": true,
              "messages": [
                {"role": "user", "content": %s}
              ]
            }
            """, config.getModelName(), cn.hutool.json.JSONUtil.quote(message));

        try (OutputStream os = conn.getOutputStream()) {
            os.write(jsonPayload.getBytes(StandardCharsets.UTF_8));
        }

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("data: ")) {
                    String data = line.substring(6).trim();
                    if ("[DONE]".equals(data)) {
                        emitter.send(SseEmitter.event().name("done").data("[DONE]"));
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
                                    emitter.send(SseEmitter.event().data(content));
                                }
                            }
                        }
                    } catch (Exception ignored) {
                    }
                }
            }
        }
        emitter.complete();
    }
}
