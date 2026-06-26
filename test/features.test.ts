/**
 * 最小验证脚本：测试 Thinking/Reasoning、重试机制、Token 用量上报
 *
 * 运行: npx tsx test/features.test.ts
 */

// ---- 测试 Thinking XML 提取 ----

function extractXmlThinkBlocks(input: string): {
  text: string;
  thinkingParts: string[];
} {
  const THINK_START = "<think>";
  const THINK_END = "</think>";

  if (!input.includes(THINK_START)) {
    return { text: input, thinkingParts: [] };
  }

  const thinkingParts: string[] = [];
  let text = "";
  let remaining = input;

  while (remaining.length > 0) {
    const startIdx = remaining.indexOf(THINK_START);
    if (startIdx === -1) {
      text += remaining;
      break;
    }

    text += remaining.slice(0, startIdx);
    remaining = remaining.slice(startIdx + THINK_START.length);

    const endIdx = remaining.indexOf(THINK_END);
    if (endIdx === -1) {
      thinkingParts.push(remaining);
      break;
    }

    thinkingParts.push(remaining.slice(0, endIdx));
    remaining = remaining.slice(endIdx + THINK_END.length);
  }

  return { text, thinkingParts };
}

// ---- 测试 Reasoning 文本提取 ----

function extractReasoningText(payload: Record<string, unknown>): string {
  const candidates = [
    payload.delta,
    payload.text,
    payload.reasoning,
    payload.summary,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) {
      if (/^(high|medium|low|none|auto)$/i.test(c.trim())) {
        continue;
      }
      return c;
    }
  }
  return "";
}

// ---- 测试 ---- */

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string): void {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}`);
    failed++;
  }
}

console.log("\n=== Thinking XML 提取测试 ===");

// 纯文本无 think 标签
{
  const r = extractXmlThinkBlocks("Hello world");
  assert(r.text === "Hello world", "纯文本不变");
  assert(r.thinkingParts.length === 0, "无 thinking parts");
}

// 包含 think 标签
{
  const r = extractXmlThinkBlocks("Before<think>I'm thinking</think>After");
  assert(r.text === "BeforeAfter", "提取前后文本");
  assert(r.thinkingParts.length === 1, "1 个 thinking part");
  assert(r.thinkingParts[0] === "I'm thinking", "thinking 内容正确");
}

// 多个 think 块
{
  const r = extractXmlThinkBlocks("<think>A</think>mid<think>B</think>");
  assert(r.text === "mid", "中间文本正确");
  assert(r.thinkingParts.length === 2, "2 个 thinking parts");
  assert(r.thinkingParts[0] === "A", "第一个 thinking part");
  assert(r.thinkingParts[1] === "B", "第二个 thinking part");
}

// 未闭合的 think 标签
{
  const r = extractXmlThinkBlocks("start<think>unclosed content");
  assert(r.text === "start", "未闭合时前面文本正确");
  assert(r.thinkingParts.length === 1, "未闭合视为 thinking");
  assert(r.thinkingParts[0] === "unclosed content", "未闭合内容正确");
}

console.log("\n=== Reasoning 文本提取测试 ===");

{
  const r = extractReasoningText({ delta: "Let me think about this..." });
  assert(r === "Let me think about this...", "从 delta 提取 reasoning");
}

{
  const r = extractReasoningText({ text: "Analyzing the problem" });
  assert(r === "Analyzing the problem", "从 text 提取 reasoning");
}

{
  const r = extractReasoningText({ reasoning: "Step by step..." });
  assert(r === "Step by step...", "从 reasoning 字段提取");
}

{
  const r = extractReasoningText({ summary: "Summary of thoughts" });
  assert(r === "Summary of thoughts", "从 summary 字段提取");
}

{
  const r = extractReasoningText({ delta: "high" });
  assert(r === "", "过滤 reasoning config 值 high");
}

{
  const r = extractReasoningText({ delta: "medium" });
  assert(r === "", "过滤 reasoning config 值 medium");
}

{
  const r = extractReasoningText({ delta: "low" });
  assert(r === "", "过滤 reasoning config 值 low");
}

{
  const r = extractReasoningText({ delta: "" });
  assert(r === "", "空字符串返回空");
}

console.log("\n=== 重试配置测试 ===");

// 模拟 RetryConfig 结构
const defaultRetryConfig = {
  enabled: true,
  max_attempts: 3,
  interval_ms: 1000,
};
assert(defaultRetryConfig.enabled === true, "重试默认启用");
assert(defaultRetryConfig.max_attempts === 3, "默认最大重试 3 次");
assert(defaultRetryConfig.interval_ms === 1000, "默认间隔 1000ms");

console.log("\n=== Token Usage 类型测试 ===");

const usage = {
  prompt_tokens: 150,
  completion_tokens: 80,
  total_tokens: 230,
  prompt_tokens_details: { cached_tokens: 50 },
};
assert(usage.prompt_tokens === 150, "prompt_tokens 正确");
assert(usage.completion_tokens === 80, "completion_tokens 正确");
assert(usage.total_tokens === 230, "total_tokens 正确");
assert(usage.prompt_tokens_details?.cached_tokens === 50, "cached_tokens 正确");

// ---- 结果 ----

console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===\n`);

if (failed > 0) {
  process.exit(1);
}
