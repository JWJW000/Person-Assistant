import { FC, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface FormattedMarkdownProps {
  content: string;
  isStreaming?: boolean;
}

export const FormattedMarkdown: FC<FormattedMarkdownProps> = memo(({ content, isStreaming }) => {
  if (!content) return null;

  return (
    <div className="prose prose-slate prose-sm max-w-none break-words leading-relaxed text-slate-800 text-[13.5px]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 加粗文字
          strong({ children }) {
            return <strong className="font-bold text-slate-900">{children}</strong>;
          },
          // 代码块美化
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !String(children).includes('\n');
            if (isInline) {
              return (
                <code className="bg-slate-100 text-blue-600 px-1.5 py-0.5 rounded text-[12px] font-mono font-medium" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <div className="my-2 rounded-xl overflow-hidden bg-slate-900 text-slate-100 text-xs shadow-xs">
                {match && (
                  <div className="bg-slate-800/80 px-3 py-1.5 text-[10px] text-slate-400 font-mono flex items-center justify-between border-b border-slate-700/50">
                    <span>{match[1]}</span>
                  </div>
                )}
                <pre className="p-3 overflow-x-auto font-mono text-[11px] leading-normal m-0">
                  <code {...props}>{children}</code>
                </pre>
              </div>
            );
          },
          // 列表紧凑化
          ul({ children }) {
            return <ul className="my-1.5 list-disc pl-4 space-y-1">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="my-1.5 list-decimal pl-4 space-y-1">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          // 标题紧凑化
          h1({ children }) {
            return <h1 className="text-base font-bold my-2 text-slate-900">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-sm font-bold my-1.5 text-slate-900">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-xs font-bold my-1 text-slate-800">{children}</h3>;
          },
          // 表格增强 (GFM)
          table({ children }) {
            return (
              <div className="my-2 overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
                <table className="min-w-full divide-y divide-slate-200 text-xs">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return <th className="bg-slate-100/80 px-3 py-2 text-left font-bold text-slate-700">{children}</th>;
          },
          td({ children }) {
            return <td className="px-3 py-2 border-t border-slate-100 text-slate-600 font-medium">{children}</td>;
          },
          // 引用块
          blockquote({ children }) {
            return (
              <blockquote className="border-l-3 border-blue-500 bg-blue-50/40 py-1.5 pl-3 pr-2 my-2 rounded-r-lg text-slate-600 text-xs">
                {children}
              </blockquote>
            );
          },
          p({ children }) {
            return <p className="my-1 leading-relaxed whitespace-pre-wrap">{children}</p>;
          }
        }}
      >
        {content}
      </ReactMarkdown>

      {/* 流式生成中的呼吸光标 */}
      {isStreaming && (
        <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-blue-600 animate-pulse align-middle" />
      )}
    </div>
  );
});

FormattedMarkdown.displayName = 'FormattedMarkdown';
