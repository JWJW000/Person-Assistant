import { useState, useRef, useCallback } from 'react';
import {
  fetchAiMessages,
  createAiSession,
  streamAiChat,
} from '../lib/aiApi';
import type { DisplayMessage } from '../components/chat/MessageItem';
import { tryParseTicketsFromText } from './useTrainTicketParser';

export interface UseAiChatOptions {
  serverUrl: string;
  accessToken: string | null;
  activeConversationId: string;
  activeKbId: number | null;
  activeModelId: number | null;
  setActiveConversationId: (id: string) => void;
  loadSessions: () => Promise<void>;
  logout: () => void;
  onScrollToBottom?: () => void;
}

export function useAiChat({
  serverUrl,
  accessToken,
  activeConversationId,
  activeKbId,
  activeModelId,
  setActiveConversationId,
  loadSessions,
  logout,
  onScrollToBottom,
}: UseAiChatOptions) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const conversationIdRef = useRef(activeConversationId);
  conversationIdRef.current = activeConversationId;

  // 拉取会话消息历史
  const loadMessages = useCallback(
    async (sessionId: string) => {
      if (!serverUrl || !accessToken || !sessionId || sessionId === 'default') {
        setMessages([]);
        return;
      }
      try {
        const msgs = await fetchAiMessages(serverUrl, accessToken, sessionId);
        const mapped: DisplayMessage[] = msgs.map((m) => {
          const tickets = m.role === 'assistant' ? tryParseTicketsFromText(m.content) : undefined;
          return {
            id: m.id,
            role: m.role,
            content: m.content,
            tickets: tickets && tickets.length > 0 ? tickets : undefined,
            createTime: m.createTime,
            skipAnimation: true,
          };
        });
        setMessages(mapped);
        if (onScrollToBottom) {
          setTimeout(onScrollToBottom, 50);
        }
      } catch (err) {
        console.warn('获取历史记录失败:', err);
      }
    },
    [serverUrl, accessToken, onScrollToBottom]
  );

  // 停止生成
  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    sendingRef.current = false;
    setLoading(false);
    setMessages((prev) =>
      prev.map((m) =>
        m.isStreaming
          ? {
              ...m,
              isStreaming: false,
              content: m.content || '（已停止生成）',
            }
          : m
      )
    );
  }, []);

  // 发送消息与流式响应处理
  const handleSendMessage = useCallback(
    async (textToSend: string) => {
      const text = textToSend.trim();
      if (!text || sendingRef.current) return;
      if (!serverUrl || !accessToken) return;

      sendingRef.current = true;

      const now = Date.now();
      const userMsg: DisplayMessage = {
        id: `u-${now}`,
        role: 'user',
        content: text,
        createTime: new Date().toISOString(),
      };
      const asstMsgId = `a-${now}`;
      const asstMsg: DisplayMessage = {
        id: asstMsgId,
        role: 'assistant',
        content: '',
        isStreaming: true,
        statusText: activeKbId ? '正在检索知识库相关资料...' : '正在深度思考并组织回答...',
        createTime: new Date().toISOString(),
      };

      setLoading(true);
      setMessages((prev) => [...prev, userMsg, asstMsg]);
      if (onScrollToBottom) {
        requestAnimationFrame(onScrollToBottom);
      }

      let targetSessionId = conversationIdRef.current;
      if (!targetSessionId || targetSessionId === 'default') {
        try {
          const newSession = await createAiSession(serverUrl, accessToken, text.slice(0, 16) || '新对话');
          targetSessionId = newSession.id;
          conversationIdRef.current = targetSessionId;
          setActiveConversationId(targetSessionId);
          loadSessions().catch(() => {});
        } catch (err: unknown) {
          sendingRef.current = false;
          setLoading(false);
          setMessages((prev) => prev.filter((m) => m.id !== userMsg.id && m.id !== asstMsgId));
          const errMsg = err instanceof Error ? err.message : String(err);
          if (
            errMsg.includes('登录') ||
            errMsg.includes('401') ||
            errMsg.includes('token') ||
            errMsg.includes('权限')
          ) {
            logout();
            return;
          }
          console.warn('创建会话失败:', err);
          return;
        }
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // 30ms 流式缓冲区节流聚合，避免单 token 高频渲染导致的 ReactMarkdown AST 重复解析卡顿
      const THROTTLE_MS = 30;
      let accumulated = '';
      let accumulatedThinking = '';
      let lastFlushTime = 0;
      let pendingRafId: number | null = null;

      const flushStreamBuffer = (forceFinal = false) => {
        if (pendingRafId !== null) {
          cancelAnimationFrame(pendingRafId);
          pendingRafId = null;
        }
        const textSnapshot = accumulated;
        const parsedTickets = textSnapshot.includes('```json') ? tryParseTicketsFromText(textSnapshot) : undefined;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === asstMsgId
              ? {
                  ...m,
                  content: textSnapshot,
                  thinkingContent: accumulatedThinking || m.thinkingContent,
                  isStreaming: !forceFinal,
                  tickets: parsedTickets && parsedTickets.length > 0 ? parsedTickets : m.tickets,
                }
              : m
          )
        );
        lastFlushTime = performance.now();
        if (onScrollToBottom) {
          requestAnimationFrame(onScrollToBottom);
        }
      };

      await streamAiChat({
        serverUrl,
        token: accessToken,
        sessionId: targetSessionId,
        message: text,
        kbId: activeKbId,
        modelId: activeModelId,
        signal: controller.signal,
        onStatus: (status) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === asstMsgId ? { ...m, statusText: status } : m
            )
          );
        },
        onThinking: (chunk) => {
          accumulatedThinking += chunk;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === asstMsgId
                ? {
                    ...m,
                    thinkingContent: accumulatedThinking,
                    statusText: '正在深度思考推理中...',
                  }
                : m
            )
          );
          if (onScrollToBottom) {
            requestAnimationFrame(onScrollToBottom);
          }
        },
        onChunk: (chunk) => {
          accumulated += chunk;
          const currentTime = performance.now();
          if (currentTime - lastFlushTime >= THROTTLE_MS) {
            flushStreamBuffer(false);
          } else if (pendingRafId === null) {
            pendingRafId = requestAnimationFrame(() => {
              pendingRafId = null;
              flushStreamBuffer(false);
            });
          }
        },
        onError: (err: unknown) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          if (
            errMsg.includes('401') ||
            errMsg.includes('登录') ||
            errMsg.includes('token')
          ) {
            logout();
            return;
          }
          if (!accumulated.trim()) {
            accumulated = '抱歉，服务响应超时或网络连接中断，请重试。';
          }
          flushStreamBuffer(true);
          setLoading(false);
          sendingRef.current = false;
          abortControllerRef.current = null;
          console.warn('生成出错:', err);
        },
        onDone: () => {
          if (!accumulated.trim() && !controller.signal.aborted) {
            accumulated = '未能获取到回复内容，请重试。';
          }
          flushStreamBuffer(true);
          setLoading(false);
          sendingRef.current = false;
          abortControllerRef.current = null;
        },
      });
    },
    [serverUrl, accessToken, activeKbId, activeModelId, loadSessions, logout, onScrollToBottom, setActiveConversationId]
  );

  // 重新生成上一条回答
  const handleRegenerate = useCallback(
    (asstMsgId: string | number) => {
      const idx = messages.findIndex((m) => m.id === asstMsgId);
      if (idx > 0) {
        const prevUserMsg = messages[idx - 1];
        if (prevUserMsg && prevUserMsg.role === 'user') {
          setMessages((prev) => prev.filter((m) => m.id !== asstMsgId));
          handleSendMessage(prevUserMsg.content);
        }
      }
    },
    [messages, handleSendMessage]
  );

  return {
    messages,
    setMessages,
    loading,
    loadMessages,
    handleSendMessage,
    handleStopGeneration,
    handleRegenerate,
  };
}
