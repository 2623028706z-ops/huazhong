// 组件事件的类型：列表项用 data-index / data-key，组件自定义事件的 detail
type AnyObject = WechatMiniprogram.IAnyObject

export type IndexEvent = WechatMiniprogram.TouchEvent<AnyObject, AnyObject, { index: number }>

export type KeyEvent = WechatMiniprogram.TouchEvent<AnyObject, AnyObject, { key: string }>

// detail 可以是字符串、数字（微信的类型只允许对象）；第二个参数是触发事件的节点上的 data-*
export type DetailEvent<T, D extends AnyObject = AnyObject> = Omit<
  WechatMiniprogram.CustomEvent<AnyObject, AnyObject, D>,
  'detail'
> & { detail: T }
