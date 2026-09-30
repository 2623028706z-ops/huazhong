// 对账格（02 章第 4 节）：两列（两格或四格），亮格底；金额衬线墨色；
// due 的格（待付 / 未收）用琥珀浅底，不用红字。金额由后端算好（分），这里只显示
interface Cell {
  label: string
  amountCents: number
  due: boolean
}

Component({
  properties: {
    cells: { type: Array, value: [] as Cell[] },
  },
})
