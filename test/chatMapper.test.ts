/**
 * 最小验证脚本：测试 chatMapper 能否正确处理典型的多轮工具调用场景
 *
 * 运行: npx tsx test/chatMapper.test.ts
 * 或:   npx ts-node test/chatMapper.test.ts
 *
 * 注意：此测试需要 VS Code API 类型，在 VS Code 扩展开发环境中运行最佳。
 * 作为替代，可以在插件加载后在 Copilot Chat 中实际测试以下场景：
 *
 * 场景 1: "帮我读取 package.json 文件内容"
 *   预期: 模型调用 read_file 工具 → Copilot Chat 执行 → 模型返回文件内容
 *
 * 场景 2: "搜索项目中所有包含 'GatewayClient' 的文件"
 *   预期: 模型调用 search 工具 → Copilot Chat 执行 → 模型返回搜索结果
 *
 * 场景 3: 多轮对话
 *   第一轮: "hello" → 预期正常文本响应
 *   第二轮: "修改这个文件" → 预期模型能基于上下文理解并响应
 */
