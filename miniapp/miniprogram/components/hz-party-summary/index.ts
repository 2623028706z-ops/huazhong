// 往来对账汇总（客户 / 供应商详情）：只突出一个红色大字金额（客户未收 / 供应商未付），
// 其余（未结清、未对账、多收、账期、期初欠款）收成一两行灰色小字。卡里不放按钮（2026-10-06 第 4 批）：
// 原右上角「修改」（往来设置）和多收后面的「退回」挪进页面底栏「更多」
interface Line {
  key: string
  text: string
}

Component({
  properties: {
    label: { type: String, value: '' },
    amountCents: { type: Number, value: 0 },
    lines: { type: Array, value: [] as Line[] },
  },
})
