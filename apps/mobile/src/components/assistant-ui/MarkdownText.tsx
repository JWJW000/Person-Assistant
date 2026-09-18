import React from 'react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';

export const MarkdownText: React.FC = () => {
  return (
    <div className="prose prose-slate max-w-none text-sm leading-relaxed dark:prose-invert">
      <MarkdownTextPrimitive />
    </div>
  );
};
