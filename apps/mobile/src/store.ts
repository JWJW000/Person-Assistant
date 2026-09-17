import { create } from 'zustand';

interface AppState {
  serverUrl: string;
  deviceToken: string | null;
  activeConversationId: string | null;
  setServerUrl: (url: string) => void;
  setDeviceToken: (token: string | null) => void;
  setActiveConversationId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  serverUrl: localStorage.getItem('server_url') || 'http://localhost:3000',
  deviceToken: localStorage.getItem('device_token') || null,
  activeConversationId: null,

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

  setActiveConversationId: (id) => set({ activeConversationId: id })
}));
