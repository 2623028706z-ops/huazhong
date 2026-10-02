import type { KeyEvent } from '../../core/events'

Component({
  properties: {
    items: { type: Array, value: [] as { key: string; text: string }[] },
    value: { type: String, value: '' },
  },
  methods: {
    onPick(event: KeyEvent) {
      this.triggerEvent('change', event.currentTarget.dataset.key)
    },
  },
})
