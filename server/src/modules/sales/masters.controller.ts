import {
  contract,
  type Catalog,
  type CustomerItem,
  type Me,
  type OutputOf,
  type ProductCategory,
  type ProductItem,
  type StoreCatalog,
  type StoreInviteView,
  type StoreItem,
} from '@huazhong/shared'
import { Controller } from '@nestjs/common'
import type { Viewer } from '../../common/domain/viewer.ts'
import {
  CurrentOpenid,
  CurrentViewer,
  Input,
  Route,
  type ParsedInput,
} from '../../common/endpoint.ts'
import { CatalogCategoryService } from './catalog-categories.ts'
import { CatalogService } from './catalog.ts'
import { CategoryService } from './categories.ts'
import { CustomerService } from './customers.ts'
import { ProductService } from './products.ts'
import { StoreCatalogService } from './store-catalog.ts'
import { StoreInviteService } from './store-invites.ts'
import { StoreWrites } from './stores.ts'

type In<K extends keyof typeof contract> = ParsedInput<(typeof contract)[K]>

@Controller()
export class CustomersController {
  constructor(
    private readonly customers: CustomerService,
    private readonly stores: StoreWrites,
    private readonly invites: StoreInviteService,
  ) {}

  @Route(contract.listCustomers)
  list(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'listCustomers'>,
  ): Promise<OutputOf<typeof contract.listCustomers>> {
    return this.customers.list(viewer, input.query)
  }

  @Route(contract.createCustomer)
  create(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'createCustomer'>,
  ): Promise<CustomerItem> {
    return this.customers.create(viewer, input.body, input.idempotencyKey)
  }

  @Route(contract.updateCustomer)
  update(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'updateCustomer'>,
  ): Promise<CustomerItem> {
    return this.customers.update(viewer, Number(input.params.id), input.body)
  }

  @Route(contract.createStore)
  createStore(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'createStore'>,
  ): Promise<StoreItem> {
    return this.stores.create(viewer, input.body, input.idempotencyKey)
  }

  @Route(contract.updateStore)
  updateStore(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'updateStore'>,
  ): Promise<StoreItem> {
    return this.stores.update(viewer, Number(input.params.id), input.body)
  }

  @Route(contract.unbindStoreWechat)
  unbindStore(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'unbindStoreWechat'>,
  ): Promise<StoreItem> {
    return this.stores.unbindWechat(viewer, Number(input.params.id), input.body.version)
  }

  @Route(contract.createStoreInvite)
  createInvite(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'createStoreInvite'>,
  ): Promise<OutputOf<typeof contract.createStoreInvite>> {
    return this.invites.create(viewer, Number(input.params.id), input.idempotencyKey)
  }

  @Route(contract.listStoreInvites)
  listInvites(
    @Input() input: In<'listStoreInvites'>,
  ): Promise<OutputOf<typeof contract.listStoreInvites>> {
    return this.invites.list(Number(input.params.id))
  }

  @Route(contract.getStoreInvite)
  viewInvite(
    @CurrentOpenid() openid: string,
    @Input() input: In<'getStoreInvite'>,
  ): Promise<StoreInviteView> {
    return this.invites.view(openid, input.params.token)
  }

  @Route(contract.useStoreInvite)
  useInvite(@CurrentOpenid() openid: string, @Input() input: In<'useStoreInvite'>): Promise<Me> {
    return this.invites.use(openid, input.params.token, input.body.code)
  }
}

@Controller()
export class ProductsController {
  constructor(
    private readonly products: ProductService,
    private readonly categories: CategoryService,
  ) {}

  @Route(contract.listProductCategories)
  listCategories(): Promise<OutputOf<typeof contract.listProductCategories>> {
    return this.categories.list()
  }

  @Route(contract.createProductCategory)
  createCategory(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'createProductCategory'>,
  ): Promise<ProductCategory> {
    return this.categories.create(viewer, input.body.name, input.idempotencyKey)
  }

  @Route(contract.updateProductCategory)
  renameCategory(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'updateProductCategory'>,
  ): Promise<ProductCategory> {
    return this.categories.rename(viewer, Number(input.params.id), input.body.name)
  }

  @Route(contract.orderProductCategories)
  orderCategories(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'orderProductCategories'>,
  ): Promise<OutputOf<typeof contract.orderProductCategories>> {
    return this.categories.reorder(viewer, input.body.ids)
  }

  @Route(contract.deleteProductCategory)
  deleteCategory(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'deleteProductCategory'>,
  ): Promise<Record<string, never>> {
    return this.categories.remove(viewer, Number(input.params.id))
  }

  @Route(contract.listProducts)
  list(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'listProducts'>,
  ): Promise<OutputOf<typeof contract.listProducts>> {
    return this.products.list(viewer, input.query)
  }

  @Route(contract.createProduct)
  create(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'createProduct'>,
  ): Promise<ProductItem> {
    return this.products.create(viewer, input.body, input.idempotencyKey)
  }

  @Route(contract.updateProduct)
  update(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'updateProduct'>,
  ): Promise<ProductItem> {
    return this.products.update(viewer, Number(input.params.id), input.body)
  }
}

// 订货目录、订货分类（X11）和门店订货页
@Controller()
export class CatalogController {
  constructor(
    private readonly catalogs: CatalogService,
    private readonly catalogCategories: CatalogCategoryService,
    private readonly storeCatalogs: StoreCatalogService,
  ) {}

  @Route(contract.getCatalog)
  getCatalog(@Input() input: In<'getCatalog'>): Promise<Catalog> {
    return this.catalogs.get(Number(input.params.customerId))
  }
  @Route(contract.previewCatalogCopy)
  previewCopy(@Input() input: In<'previewCatalogCopy'>) {
    return this.catalogs.preview(
      Number(input.params.customerId),
      Number(input.query.fromCustomerId),
    )
  }
  @Route(contract.copyCatalog)
  copyCatalog(@CurrentViewer() viewer: Viewer, @Input() input: In<'copyCatalog'>) {
    return this.catalogs.copy(
      viewer,
      Number(input.params.customerId),
      input.body,
      input.idempotencyKey,
    )
  }

  @Route(contract.saveCatalogItem)
  saveCatalogItem(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'saveCatalogItem'>,
  ): Promise<Catalog> {
    const { customerId, productId } = input.params
    return this.catalogs.saveItem(viewer, Number(customerId), Number(productId), input.body)
  }

  @Route(contract.createCatalogCategory)
  createCatalogCategory(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'createCatalogCategory'>,
  ): Promise<Catalog> {
    const customerId = Number(input.params.customerId)
    return this.catalogCategories.create(viewer, customerId, input.body.name, input.idempotencyKey)
  }

  @Route(contract.updateCatalogCategory)
  renameCatalogCategory(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'updateCatalogCategory'>,
  ): Promise<Catalog> {
    const { customerId, id } = input.params
    return this.catalogCategories.rename(viewer, Number(customerId), Number(id), input.body.name)
  }

  @Route(contract.orderCatalogCategories)
  orderCatalogCategories(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'orderCatalogCategories'>,
  ): Promise<Catalog> {
    return this.catalogCategories.reorder(viewer, Number(input.params.customerId), input.body.ids)
  }

  @Route(contract.deleteCatalogCategory)
  deleteCatalogCategory(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'deleteCatalogCategory'>,
  ): Promise<Catalog> {
    const { customerId, id } = input.params
    return this.catalogCategories.remove(viewer, Number(customerId), Number(id))
  }

  @Route(contract.storeCatalog)
  storeCatalog(@CurrentViewer() viewer: Viewer): Promise<StoreCatalog> {
    return this.storeCatalogs.catalog(viewer)
  }
}
