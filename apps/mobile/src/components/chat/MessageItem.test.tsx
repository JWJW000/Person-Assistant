import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MessageItem } from './MessageItem';
import { cleanDisplayContent, tryParseTicketsFromText } from '../../hooks/useTrainTicketParser';

describe('MessageItem rendering', () => {
  it('renders streaming state with empty content', () => {
    const html = renderToString(
      <MessageItem
        msg={{
          id: '1',
          role: 'assistant',
          content: '',
          isStreaming: true,
          statusText: '正在思考...',
        }}
        activeKbId={null}
        isExpanded={false}
        isCopied={false}
        onCopyText={() => {}}
        onCopyMessage={() => {}}
        onRegenerate={() => {}}
        onToggleExpanded={() => {}}
        onViewRoute={() => {}}
      />
    );
    expect(html).toContain('正在思考...');
  });

  it('safely parses and renders corrupt/partial JSON tickets without crashing', () => {
    const partialTickets = tryParseTicketsFromText('```json\n[{"trainCode": "G99"}]\n```');
    expect(partialTickets.length).toBe(1);
    expect(partialTickets[0].from.name).toBe('出发');

    const html = renderToString(
      <MessageItem
        msg={{
          id: '2',
          role: 'assistant',
          content: 'Here are the tickets:\n```json\n[{"trainCode": "G99"}]\n```',
          tickets: partialTickets,
          isStreaming: false,
        }}
        activeKbId={null}
        isExpanded={false}
        isCopied={false}
        onCopyText={() => {}}
        onCopyMessage={() => {}}
        onRegenerate={() => {}}
        onToggleExpanded={() => {}}
        onViewRoute={() => {}}
      />
    );
    expect(html).toContain('G99');
    expect(html).toContain('出发');
  });

  it('keeps streaming text without eating uncompleted json blocks', () => {
    const text = 'Here is the train information:\n```json\n[{"trainCode": "G1"';
    const cleaned = cleanDisplayContent(text);
    expect(cleaned).toBe(text);
  });
});
