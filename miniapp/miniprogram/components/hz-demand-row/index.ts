import type { DetailEvent } from '../../core/events'
Component({
  properties: {
    selected: { type: Boolean, value: false },
    enabled: { type: Boolean, value: true },
    name: { type: String, value: '' },
    range: { type: String, value: '' },
    summary: { type: String, value: '' },
    left: { type: String, value: '' },
    short: { type: Boolean, value: false },
    tags: { type: Array, value: [] },
  },
  methods: {
    onToggle() {
      if (this.data.enabled) this.triggerEvent('toggle')
    },
    onOpen(_event: DetailEvent<unknown>) {
      this.triggerEvent('open')
    },
  },
})
