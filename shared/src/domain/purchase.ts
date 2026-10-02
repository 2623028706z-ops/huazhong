// 采购需求带入表单的缺口；够用时保留 0，交由采购确认数量。
export function gapOf(leftQty: number): number {
  return Math.max(0, -leftQty)
}
