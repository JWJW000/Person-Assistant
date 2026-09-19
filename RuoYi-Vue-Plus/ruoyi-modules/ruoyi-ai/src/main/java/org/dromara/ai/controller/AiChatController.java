package org.dromara.ai.controller;

import lombok.RequiredArgsConstructor;
import org.dromara.ai.domain.entity.AiChatMessage;
import org.dromara.ai.domain.entity.AiChatSession;
import org.dromara.ai.service.IAiChatService;
import org.dromara.common.core.domain.R;
import org.dromara.common.core.domain.PageResult;
import org.dromara.common.mybatis.core.page.PageQuery;
import org.dromara.common.web.core.BaseController;
import org.springframework.http.MediaType;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

/**
 * AI 对话核心控制器
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
     * 分页查询全平台会话管理列表
     */
    @GetMapping("/session/list")
    public R<PageResult<AiChatSession>> listSessions(AiChatSession session, PageQuery pageQuery) {
        return R.ok(chatService.selectSessionList(session, pageQuery));
    }

    /**
     * 分页查询消息审计记录列表
     */
    @GetMapping("/message/list")
    public R<PageResult<AiChatMessage>> listMessages(AiChatMessage message, PageQuery pageQuery) {
        return R.ok(chatService.selectMessageList(message, pageQuery));
    }

    /**
     * 删除单条消息
     */
    @DeleteMapping("/message/{id}")
    public R<Void> removeMessage(@PathVariable("id") Long id) {
        return toAjax(chatService.deleteMessageById(id));
    }

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
    public R<Boolean> deleteSession(@PathVariable("sessionId") String sessionId) {
        return R.ok(chatService.deleteSession(sessionId));
    }

    /**
     * 获取会话内的历史消息详情列表
     */
    @GetMapping("/messages/{sessionId}")
    public R<List<AiChatMessage>> getMessages(@PathVariable("sessionId") String sessionId) {
        return R.ok(chatService.getSessionMessages(sessionId));
    }

    /**
     * 流式 SSE 发送对话 (长连接打字机效果)
     * 支持 GET / POST 均可建立 text/event-stream 响应
     */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamChatGet(
        @RequestParam("sessionId") String sessionId,
        @RequestParam("message") String message,
        @RequestParam(value = "kbId", required = false) Long kbId,
        @RequestParam(value = "modelId", required = false) Long modelId) {
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
