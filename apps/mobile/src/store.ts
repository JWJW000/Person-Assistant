import { create } from 'zustand';
import { DEFAULT_RELAY_MODELS, DEFAULT_KNOWLEDGE_BASES } from './lib/aiApi';

export interface ConversationItem {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeBaseItem {
  id: number;
  name: string;
  description?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  isPublic?: string;
  embeddingModelId?: number;
}

export interface AiModelItem {
  id: number;
  name: string;
  provider: string;
  modelType: string;
  modelName: string;
  isDefault: string;
}

interface AppState {
  serverUrl: string;
  accessToken: string | null;
  deviceToken: string | null;
  currentUser: string | null;
  activeConversationId: string;
  conversations: ConversationItem[];
  activeKbId: number | null;
  knowledgeBases: KnowledgeBaseItem[];
  activeModelId: number | null;
  chatModels: AiModelItem[];
  selectedPiHostId: string | null;
  selectedPiTaskId: string | null;
  piEventCursors: Record<string, number>;

  setServerUrl: (url: string) => void;
  setAccessToken: (token: string | null) => void;
  setDeviceToken: (token: string | null) => void;
  setCurrentUser: (user: string | null) => void;
  setActiveConversationId: (id: string) => void;
  setConversations: (items: ConversationItem[]) => void;
  setActiveKbId: (kbId: number | null) => void;
  setKnowledgeBases: (bases: KnowledgeBaseItem[]) => void;
  setActiveModelId: (modelId: number | null) => void;
  setChatModels: (models: AiModelItem[]) => void;
  setSelectedPiHostId: (id: string | null) => void;
  setSelectedPiTaskId: (id: string | null) => void;
  setPiEventCursor: (runId: string, seq: number) => void;
  logout: () => void;
}

try {
  localStorage.removeItem('active_conversation_id');
} catch {}

export const useAppStore = create<AppState>((set) => ({
  serverUrl: (() => {
    const saved = localStorage.getItem('server_url');
    // 如果存储了旧版 fastify 查票地址，自动无缝升级迁移至 AI 后端主地址
    if (!saved || saved.includes('train.5wjw.cn')) {
      localStorage.setItem('server_url', 'https://ai.5wjw.cn');
      return 'https://ai.5wjw.cn';
    }
    return saved;
  })(),
  accessToken: localStorage.getItem('access_token') || null,
  deviceToken: localStorage.getItem('device_token') || null,
  currentUser: localStorage.getItem('current_user') || null,
  activeConversationId: 'default',
  conversations: [],
  activeKbId: (() => {
    const v = localStorage.getItem('active_kb_id');
    return v && v !== 'null' ? Number(v) : 4; // 默认挂载系统核心知识库
  })(),
  knowledgeBases: DEFAULT_KNOWLEDGE_BASES,
  activeModelId: (() => {
    const v = localStorage.getItem('active_model_id');
    return v && v !== 'null' ? Number(v) : 7; // 默认选用 DeepSeek V4 Pro (id: 7)
  })(),
  chatModels: DEFAULT_RELAY_MODELS,
  selectedPiHostId: localStorage.getItem('selected_pi_host_id'),
  selectedPiTaskId: localStorage.getItem('selected_pi_task_id'),
  piEventCursors: (() => { try { return JSON.parse(localStorage.getItem('pi_event_cursors') || '{}'); } catch { return {}; } })(),

  setServerUrl: (url) => {
    localStorage.setItem('server_url', url);
    set({ serverUrl: url });
  },

  setAccessToken: (token) => {
    if (token) {
      localStorage.setItem('access_token', token);
    } else {
      localStorage.removeItem('access_token');
    }
    set({ accessToken: token });
  },

  setDeviceToken: (token) => {
    if (token) {
      localStorage.setItem('device_token', token);
    } else {
      localStorage.removeItem('device_token');
    }
    set({ deviceToken: token });
  },

  setCurrentUser: (user) => {
    if (user) {
      localStorage.setItem('current_user', user);
    } else {
      localStorage.removeItem('current_user');
    }
    set({ currentUser: user });
  },

  setActiveConversationId: (id) => {
    set({ activeConversationId: id });
  },

  setConversations: (conversations) => set({ conversations }),

  setActiveKbId: (kbId) => {
    if (kbId !== null) {
      localStorage.setItem('active_kb_id', String(kbId));
    } else {
      localStorage.removeItem('active_kb_id');
    }
    set({ activeKbId: kbId });
  },

  setKnowledgeBases: (bases) => set({ knowledgeBases: bases }),

  setActiveModelId: (modelId) => {
    if (modelId !== null) {
      localStorage.setItem('active_model_id', String(modelId));
    } else {
      localStorage.removeItem('active_model_id');
    }
    set({ activeModelId: modelId });
  },

  setChatModels: (models) => set({ chatModels: models }),
  setSelectedPiHostId: (selectedPiHostId) => { selectedPiHostId ? localStorage.setItem('selected_pi_host_id', selectedPiHostId) : localStorage.removeItem('selected_pi_host_id'); set({ selectedPiHostId }); },
  setSelectedPiTaskId: (selectedPiTaskId) => { selectedPiTaskId ? localStorage.setItem('selected_pi_task_id', selectedPiTaskId) : localStorage.removeItem('selected_pi_task_id'); set({ selectedPiTaskId }); },
  setPiEventCursor: (runId, seq) => set((state) => { const piEventCursors = { ...state.piEventCursors, [runId]: Math.max(state.piEventCursors[runId] || 0, seq) }; localStorage.setItem('pi_event_cursors', JSON.stringify(piEventCursors)); return { piEventCursors }; }),

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('device_token');
    localStorage.removeItem('current_user');
    localStorage.removeItem('active_kb_id');
    localStorage.removeItem('active_model_id');
    localStorage.removeItem('active_conversation_id');
    localStorage.removeItem('selected_pi_host_id');
    localStorage.removeItem('selected_pi_task_id');
    localStorage.removeItem('pi_event_cursors');
    set({
      accessToken: null,
      deviceToken: null,
      currentUser: null,
      activeKbId: 4,
      activeModelId: 7,
      conversations: [],
      knowledgeBases: DEFAULT_KNOWLEDGE_BASES,
      chatModels: DEFAULT_RELAY_MODELS,
      selectedPiHostId: null,
      selectedPiTaskId: null,
      piEventCursors: {},
    });
  },
}));
