interface Step {
  label: string
  date?: string
  state: 'done' | 'current' | 'pending' | 'ended'
}
Component({ properties: { steps: { type: Array, value: [] as Step[] } } })
