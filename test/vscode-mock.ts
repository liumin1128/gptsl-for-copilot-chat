/**
 * 最小 vscode mock，仅供纯函数测试在 Node 环境下运行。
 * 只需提供测试代码路径会触发 instanceof 的占位类。
 */
export class LanguageModelTextPart {
  constructor(public value: string) {}
}
export class LanguageModelToolCallPart {
  constructor(
    public callId: string,
    public name: string,
    public input: unknown,
  ) {}
}
export class LanguageModelDataPart {
  constructor(
    public data: Uint8Array,
    public mimeType: string,
  ) {}
}
