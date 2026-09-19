package org.dromara.ai.controller;

import lombok.RequiredArgsConstructor;
import org.dromara.ai.domain.entity.AiChatMessage;
import org.dromara.ai.domain.entity.AiChatSession;
import org.dromara.ai.service.IAiChatService;
import org.dromara.common.core.domain.R;
import org.dromara.common.web.core.BaseController;
import org.springframework.http.MediaType;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

/**
 * AI 会话与流式对话控制器 (支持 Web 和 App 客户端)
 *
 * @author ruoyi
 */
@Validated
@RestController
@RequestMapping("/ai/chat")
@RequiredArgsConstructor
public class AiChatController extends BaseController {

    private final IAiChatService chatService;

    /**
     * 获取用户所有会话列表
     */
    @GetMapping("/sessions")
    public R<List<AiChatSession>> getSessions() {
        return R.ok(chatService.getUserSessions());
    }

    /**
     * 新建会话
     */
    @PostMapping("/session/create")
    public R<AiChatSession> createSession(@RequestBody(required = false) Map<String, Object> params) {
        String title = params != null && params.get("title") != null ? params.get("title").toString() : "新对话";
        Long assistantId = params != null && params.get("assistantId") != null ? Long.valueOf(params.get("assistantId").toString()) : null;
        return R.ok(chatService.createSession(title, assistantId));
    }

    /**
     * 删除会话
     */
    @DeleteMapping("/session/{sessionId}")
    public R<Boolean> deleteSession(@PathVariable String sessionId) {
        return R.ok(chatService.deleteSession(sessionId));
    }

    /**
     * 获取会话内的历史消息详情列表
     */
    @GetMapping("/messages/{sessionId}")
    public R<List<AiChatMessage>> getMessages(@PathVariable String sessionId) {
        return R.ok(chatService.getSessionMessages(sessionId));
    }

    /**
     * 流式 SSE 发送对话 (长连接打字机效果)
     * 支持 GET / POST 均可建立 text/event-stream 响应
     */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamChatGet(
        @RequestParam String sessionId,
        @RequestParam String message,
        @RequestParam(required = false) Long kbId,
        @RequestParam(required = false) Long modelId) {
        return chatService.streamChat(sessionId, message, kbId, modelId);
    }

    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamChatPost(@RequestBody Map<String, Object> body) {
        String sessionId = body.get("sessionId").toString();
        String message = body.get("message").toString();
        Long kbId = body.get("kbId") != null ? Long.valueOf(body.get("kbId").toString()) : null;
        Long modelId = body.get("modelId") != null ? Long.valueOf(body.get("modelId").toString()) : null;
        return chatService.streamChat(sessionId, message, kbId, modelId);
    }
}
