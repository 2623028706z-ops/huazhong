export const purchaseScreen = {
  repriceFrom: (from: string, to: string) => `改价 ${from} → ${to}`,
  receiveQty: (qty: number, received: number, returned: number, unit: string) =>
    `采购 ${qty} ${unit}\u3000\u3000实收 ${received} ${unit}\u3000\u3000退货 ${returned} ${unit}`,
  invitedPending: '已邀请（未提交，不算在途）',
  supplierPlaceholder: '请选择供应商',
  notSupplied: '未供',
  extraSupply: '另报',
  supplyQty: (qty: number, unit: string) => `供 ${qty} ${unit}`,
  returnableQty: (qty: number, unit: string) => `可退 ${qty} ${unit}`,
  totalAmount: (amount: string, units: string) => `${amount}\u3000\u3000共 ${units}`,
  sourceShipDate: (date: string) => `${date} 出货`,
  confirmReturn: '确认退货',
  confirmReprice: '确认改价',
} as const
