import React, { useState } from 'react';
import { useAppStore } from './store';
import { PairingPage } from './pages/PairingPage';
import { ChatPage } from './pages/ChatPage';

export const App: React.FC = () => {
  const { deviceToken } = useAppStore();
  const [paired, setPaired] = useState(!!deviceToken);

  if (!paired) {
    return <PairingPage onPaired={() => setPaired(true)} />;
  }

  return <ChatPage />;
};
