import { McpBridge } from '@assistant/mcp-bridge';

async function main() {
  console.log('--- 12306 MCP 自检程序 ---');
  const bridge = new McpBridge({
    entrypoint: process.env.MCP_ENTRYPOINT
  });

  try {
    console.log('1. 正在尝试连接 MCP 子进程...');
    await bridge.connect();
    console.log('2. 获取工具列表...');
    const tools = await bridge.listTools();
    console.log('可用工具:', tools);

    if (!tools.includes('get-tickets')) {
      throw new Error('未在 MCP 中发现必要工具 get-tickets');
    }
    console.log('MCP 自检状态: PASSED');
  } catch (err: any) {
    console.log('MCP 自检状态: BLOCKED/FAILED');
    console.log('原因:', err?.message || err);
  } finally {
    await bridge.disconnect();
  }
}

main();
