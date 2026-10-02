import { contract, type OrderDetail, type OutputOf, type ShippingDetail } from '@huazhong/shared'
import { Controller } from '@nestjs/common'
import type { Viewer } from '../../common/domain/viewer.ts'
import { CurrentViewer, Input, Route, type ParsedInput } from '../../common/endpoint.ts'
import { OrderReads } from './order-query.ts'
import { SalesOrderWrites } from './sales-orders.ts'
import { StoreOrderWrites } from './store-orders.ts'

type In<K extends keyof typeof contract> = ParsedInput<(typeof contract)[K]>

@Controller()
export class OrdersController {
  constructor(
    private readonly reads: OrderReads,
    private readonly sales: SalesOrderWrites,
    private readonly store: StoreOrderWrites,
  ) {}

  @Route(contract.listOrders)
  list(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'listOrders'>,
  ): Promise<OutputOf<typeof contract.listOrders>> {
    return this.reads.list(viewer, input.query)
  }

  @Route(contract.listShippingOrders)
  listShipping(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'listShippingOrders'>,
  ): Promise<OutputOf<typeof contract.listShippingOrders>> {
    return this.reads.listShipping(viewer, input.query)
  }

  @Route(contract.getOrder)
  get(@CurrentViewer() viewer: Viewer, @Input() input: In<'getOrder'>): Promise<OrderDetail> {
    return this.reads.detail(viewer, Number(input.params.id))
  }
  @Route(contract.getShippingOrder)
  shipping(@CurrentViewer() viewer: Viewer, @Input() input: In<'getShippingOrder'>) {
    return this.reads.shipping(viewer, Number(input.params.id))
  }

  @Route(contract.createOrder)
  create(@CurrentViewer() viewer: Viewer, @Input() input: In<'createOrder'>): Promise<OrderDetail> {
    return this.sales.create(viewer, input.body, input.idempotencyKey)
  }

  @Route(contract.confirmOrder)
  confirm(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'confirmOrder'>,
  ): Promise<OrderDetail> {
    return this.sales.confirm(viewer, Number(input.params.id), input.body)
  }

  @Route(contract.updateOrder)
  update(@CurrentViewer() viewer: Viewer, @Input() input: In<'updateOrder'>): Promise<OrderDetail> {
    return this.sales.update(viewer, Number(input.params.id), input.body)
  }

  @Route(contract.cancelOrder)
  cancel(@CurrentViewer() viewer: Viewer, @Input() input: In<'cancelOrder'>): Promise<OrderDetail> {
    return this.sales.cancel(viewer, Number(input.params.id), input.body)
  }

  @Route(contract.shipOrder)
  ship(@CurrentViewer() viewer: Viewer, @Input() input: In<'shipOrder'>): Promise<ShippingDetail> {
    return this.sales.ship(viewer, Number(input.params.id), input.body)
  }

  @Route(contract.createStoreOrder)
  storeCreate(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'createStoreOrder'>,
  ): Promise<OrderDetail> {
    return this.store.create(viewer, input.body, input.idempotencyKey)
  }

  @Route(contract.updateStoreOrder)
  storeUpdate(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'updateStoreOrder'>,
  ): Promise<OrderDetail> {
    return this.store.update(viewer, Number(input.params.id), input.body)
  }

  @Route(contract.cancelStoreOrder)
  storeCancel(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'cancelStoreOrder'>,
  ): Promise<OrderDetail> {
    return this.store.cancel(viewer, Number(input.params.id), input.body.version)
  }
}
