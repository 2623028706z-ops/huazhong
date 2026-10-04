import { minorFieldSet } from '@huazhong/shared'
import type { DetailEvent } from '../../core/events'
Component({
  properties: {
    rows: {
      type: Array,
      value: [] as {
        label: string
        value: string
        url?: string
        phone?: string
        wide?: boolean
        minor?: boolean
      }[],
    },
    // 两列并排；行上的 wide 占整行
    cols: { type: Boolean, value: false },
  },
  data: { minorSet: minorFieldSet },
  methods: {
    onLink(event: DetailEvent<unknown, { url?: string; phone?: string }>) {
      const { url, phone } = event.currentTarget.dataset
      if (phone) void wx.makePhoneCall({ phoneNumber: phone })
      else if (url) void wx.navigateTo({ url })
    },
  },
})
