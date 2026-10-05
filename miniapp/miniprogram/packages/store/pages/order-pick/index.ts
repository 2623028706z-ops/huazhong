// S12 选择订单（申请售后，06 章 S12）：售后段底栏「申请售后」进来，只列本店能申请售后的已发货订单
import { orderPickPage } from '../../../../views/order-pick'

Page(orderPickPage({ forStore: true }))
