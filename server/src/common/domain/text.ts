// 可选的文字字段：库里没填存空字符串，接口返回 null（00 章第 3 节）
export function orNull(text: string): string | null {
  return text === '' ? null : text
}
