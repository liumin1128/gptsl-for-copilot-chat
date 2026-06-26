/**
 * 纯函数验证脚本（零测试框架依赖）
 *
 * 运行: npx tsx test/pureFunctions.test.ts
 *
 * 仅验证不依赖 vscode 运行时的纯逻辑：
 * - imageHelper: toBase64 / toDataUrl / isImagePart（基于 duck-typing）
 * - tokenCount: 字符串路径的 CJK 与 ASCII 差异化估算
 *
 * 说明：imageHelper 与 tokenCount 仅以 type-only 方式引用 vscode，
 * 运行时 instanceof 分支在此脚本中不触发（我们只走字符串/数据路径）。
 */

// 运行: npx tsx --tsconfig test/tsconfig.json test/pureFunctions.test.ts
// test/tsconfig.json 通过 paths 将 "vscode" 重定向到 test/vscode-mock.ts，
// 使纯函数模块可在 Node 下独立运行。
import { isImagePart, toBase64, toDataUrl } from "../src/utils/imageHelper";
import { countTokens } from "../src/utils/tokenCount";

let passed = 0;
let failed = 0;

function assert(cond: boolean, message: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(
    actual === expected,
    `${message} (期望 ${String(expected)}, 实际 ${String(actual)})`,
  );
}

// ---- imageHelper ----
console.log("imageHelper:");
{
  const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
  assertEqual(toBase64(data), "SGVsbG8=", "toBase64 编码正确");
  assertEqual(
    toDataUrl("image/png", "SGVsbG8="),
    "data:image/png;base64,SGVsbG8=",
    "toDataUrl 拼接正确",
  );

  // isImagePart: 支持的图片 mime
  assert(
    isImagePart({ mimeType: "image/png", data: new Uint8Array([1]) }),
    "isImagePart 接受 image/png",
  );
  assert(
    isImagePart({ mimeType: "image/jpeg", data: new Uint8Array([1]) }),
    "isImagePart 接受 image/jpeg",
  );
  // 不支持的类型
  assert(
    !isImagePart({ mimeType: "application/pdf", data: new Uint8Array([1]) }),
    "isImagePart 拒绝非图片 mime",
  );
  // data 非 Uint8Array
  assert(
    !isImagePart({ mimeType: "image/png", data: "not-bytes" }),
    "isImagePart 拒绝非 Uint8Array data",
  );
  assert(!isImagePart(null), "isImagePart 拒绝 null");
  assert(!isImagePart("string"), "isImagePart 拒绝字符串");
}

// ---- tokenCount（字符串路径）----
console.log("tokenCount:");
{
  // 纯 ASCII: 约 length/4
  assertEqual(countTokens("aaaa"), 1, "4 个 ASCII = 1 token");
  assertEqual(countTokens("aaaaaaaa"), 2, "8 个 ASCII = 2 token");

  // 纯中文: 约 length/1.5，比 ASCII 估算更高
  const cn = "你好世界"; // 4 个 CJK -> ceil(4/1.5)=3
  assertEqual(countTokens(cn), 3, "4 个中文 = 3 token");

  // 中文估算应高于同长度 ASCII（验证差异化生效）
  const asciiSame = "abcd";
  assert(
    countTokens(cn) > countTokens(asciiSame),
    "相同字符数下中文 token 估算更高",
  );

  // 空字符串
  assertEqual(countTokens(""), 0, "空字符串 = 0 token");

  // 混合: 中英混排
  const mixed = "hello你好"; // 5 ASCII + 2 CJK -> ceil(5/4 + 2/1.5)=ceil(1.25+1.33)=3
  assertEqual(countTokens(mixed), 3, "中英混排估算正确");
}

// ---- 汇总 ----
console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) {
  process.exit(1);
}
