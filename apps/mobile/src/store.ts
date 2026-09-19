import { create } from 'zustand';

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
  logout: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  serverUrl: localStorage.getItem('server_url') || 'https://ai.5wjw.cn',
  accessToken: localStorage.getItem('access_token') || null,
  deviceToken: localStorage.getItem('device_token') || null,
  currentUser: localStorage.getItem('current_user') || null,
  activeConversationId: localStorage.getItem('active_conversation_id') || 'default',
  conversations: [],
  activeKbId: (() => {
    const v = localStorage.getItem('active_kb_id');
    return v && v !== 'null' ? Number(v) : null;
  })(),
  knowledgeBases: [],
  activeModelId: (() => {
    const v = localStorage.getItem('active_model_id');
    return v && v !== 'null' ? Number(v) : null;
  })(),
  chatModels: [],

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
    localStorage.setItem('active_conversation_id', id);
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

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('device_token');
    localStorage.removeItem('current_user');
    localStorage.removeItem('active_kb_id');
    localStorage.removeItem('active_model_id');
    set({
      accessToken: null,
      deviceToken: null,
      currentUser: null,
      activeKbId: null,
      activeModelId: null,
      conversations: [],
      knowledgeBases: [],
      chatModels: [],
    });
  },
}));
