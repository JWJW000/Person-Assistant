import { create } from 'zustand';

export interface ConversationItem {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface AppState {
  serverUrl: string;
  deviceToken: string | null;
  activeConversationId: string;
  conversations: ConversationItem[];
  setServerUrl: (url: string) => void;
  setDeviceToken: (token: string | null) => void;
  setActiveConversationId: (id: string) => void;
  setConversations: (items: ConversationItem[]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  serverUrl: localStorage.getItem('server_url') || 'https://train.5wjw.cn',
  deviceToken: localStorage.getItem('device_token') || null,
  activeConversationId: localStorage.getItem('active_conversation_id') || 'default',
  conversations: [],

  setServerUrl: (url) => {
    localStorage.setItem('server_url', url);
    set({ serverUrl: url });
  },

  setDeviceToken: (token) => {
    if (token) {
      localStorage.setItem('device_token', token);
    } else {
      localStorage.removeItem('device_token');
    }
    set({ deviceToken: token });
  },

  setActiveConversationId: (id) => {
    localStorage.setItem('active_conversation_id', id);
    set({ activeConversationId: id });
  },

  setConversations: (conversations) => set({ conversations })
}));
