// 图片上传（02 章第 4 节）：张数、大小上限见 AFTER_IMAGE_MAX_COUNT、IMAGE_MAX_BYTES；
// 缩略图 1:1，右上角删除，可预览；添加格是虚线框 + 陶土红加号。
// 只管选图和删图：选好的文件发 add，删第几张发 remove，传到 COS 由页面走 core 做
import { AFTER_IMAGE_MAX_COUNT, IMAGE_MAX_BYTES } from '@huazhong/shared'
import type { DetailEvent } from '../../core/events'

interface UploadFile {
  url: string
}

const BYTES_PER_KB = 1024
// 缩略图 72px（375 宽下 = 144rpx，TDesign 的格子尺寸单位是 rpx）
const THUMB_RPX = 144
const COLUMNS = 4

Component({
  properties: {
    files: { type: Array, value: [] as UploadFile[] },
    max: { type: Number, value: AFTER_IMAGE_MAX_COUNT },
    // 一行几格：只放一张图的地方（目录产品顶卡）传 1，格子仍是 72px
    column: { type: Number, value: COLUMNS },
  },
  observers: {
    column(column: number) {
      this.setData({ gridConfig: { column, width: THUMB_RPX, height: THUMB_RPX } })
    },
  },
  data: {
    sizeLimit: IMAGE_MAX_BYTES / BYTES_PER_KB,
    gridConfig: { column: COLUMNS, width: THUMB_RPX, height: THUMB_RPX },
  },
  methods: {
    onAdd(event: DetailEvent<{ files: UploadFile[] }>) {
      this.triggerEvent('add', event.detail.files)
    },
    onRemove(event: DetailEvent<{ index: number }>) {
      this.triggerEvent('remove', event.detail.index)
    },
  },
})
