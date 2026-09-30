// 单号：按 DOC_NO_FORMAT 拼（05 章第 1.6 节），例如 SO-260930-001；序号超过 999 自然变 4 位
import { DOC_NO_FORMAT, type DocPrefix } from '@huazhong/shared'

const SEQ_TOKEN = /\{seq:(\d+)\}/

export function formatDocNo(prefix: DocPrefix, day: string, seq: number): string {
  // 2026-09-30 → 260930
  const yymmdd = day.slice(2).replaceAll('-', '')
  return DOC_NO_FORMAT.replace('{prefix}', prefix)
    .replace('{yymmdd}', yymmdd)
    .replace(SEQ_TOKEN, (_match, width: string) => String(seq).padStart(Number(width), '0'))
}
