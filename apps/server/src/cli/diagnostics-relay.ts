async function main() {
  console.log('--- 中转站 Relay 自检程序 ---');
  const baseUrl = process.env.RELAY_BASE_URL;
  const modelId = process.env.RELAY_MODEL_ID;

  if (!baseUrl || !modelId || baseUrl.includes('example.com')) {
    console.log('中转站状态: NOT_CONFIGURED (缺少真实中转站配置)');
    return;
  }

  console.log(`正在测试端点: ${baseUrl}，模型: ${modelId}`);
  // 这里执行针对中转站的连通性及 content_filter 预检测试
}

main();
