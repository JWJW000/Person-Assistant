package org.dromara.ai.service;

import org.dromara.ai.domain.entity.AiChatMessage;
import org.dromara.ai.domain.entity.AiChatSession;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

/**
 * AI 对话服务
 */
public interface IAiChatService {

    /**
     * 获取当前用户的会话列表
     */
    List<AiChatSession> getUserSessions();

    /**
     * 创建新会话
     */
    AiChatSession createSession(String title, Long assistantId);

    /**
     * 删除会话
     */
    boolean deleteSession(String sessionId);

    /**
     * 获取会话的消息列表
     */
    List<AiChatMessage> getSessionMessages(String sessionId);

    /**
     * 发送消息并进行流式 SSE 打字机响应（自动落库）
     */
    SseEmitter streamChat(String sessionId, String userMessage, Long kbId);

    /**
     * 发送消息并指定特定模型进行流式 SSE 打字机响应（自动落库）
     */
    SseEmitter streamChat(String sessionId, String userMessage, Long kbId, Long modelId);
}
