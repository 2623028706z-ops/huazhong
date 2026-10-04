import type { DetailEvent } from '../../core/events'
Component({
  properties: {
    rows: {
      type: Array,
      value: [] as { label: string; value: string; url?: string; phone?: string }[],
    },
  },
  methods: {
    onLink(event: DetailEvent<unknown, { url?: string; phone?: string }>) {
      const { url, phone } = event.currentTarget.dataset
      if (phone) void wx.makePhoneCall({ phoneNumber: phone })
      else if (url) void wx.navigateTo({ url })
    },
  },
})
