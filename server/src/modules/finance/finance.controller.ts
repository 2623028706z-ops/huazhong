import { statementCopy } from '@huazhong/shared'
import { appError, contract } from '@huazhong/shared'
import { Controller } from '@nestjs/common'
import type { Viewer } from '../../common/domain/viewer.ts'
import { CurrentViewer, Input, Route, type ParsedInput } from '../../common/endpoint.ts'
import { StatementReads } from './statement-reads.ts'
import { StatementWrites } from './statement-writes.ts'
import { FundsService } from './funds.ts'
import { MethodService } from './methods.ts'
type In<K extends keyof typeof contract> = ParsedInput<(typeof contract)[K]>
@Controller()
export class FinanceController {
  constructor(
    private readonly reads: StatementReads,
    private readonly writes: StatementWrites,
    private readonly funds: FundsService,
    private readonly methods: MethodService,
  ) {}
  @Route(contract.listArCustomers) customers(@Input() i: In<'listArCustomers'>) {
    return this.reads.read((tx) => this.reads.parties(tx, 'customer', i.query))
  }
  @Route(contract.listFinanceSuppliers) suppliers(@Input() i: In<'listFinanceSuppliers'>) {
    return this.reads.read((tx) => this.reads.parties(tx, 'supplier', i.query))
  }
  @Route(contract.getArCustomer) customer(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'getArCustomer'>,
  ) {
    return this.reads.read((tx) =>
      this.reads.ledger(tx, v, { kind: 'customer', id: Number(i.params.id) }, i.query),
    )
  }
  @Route(contract.getFinanceSupplier) supplier(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'getFinanceSupplier'>,
  ) {
    return this.reads.read((tx) =>
      this.reads.ledger(tx, v, { kind: 'supplier', id: Number(i.params.id) }, i.query),
    )
  }
  @Route(contract.statementDraft) draft(@Input() i: In<'statementDraft'>) {
    return this.reads.read((tx) =>
      this.reads.draft(tx, i.query.kind, Number(i.query.partyId), {
        from: i.query.from,
        to: i.query.to,
      }),
    )
  }
  @Route(contract.listStatements) statements(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'listStatements'>,
  ) {
    return this.reads.read((tx) => this.reads.list(tx, v, i.query))
  }
  @Route(contract.createStatement) create(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'createStatement'>,
  ) {
    return this.writes.create(v, i.body, i.idempotencyKey)
  }
  @Route(contract.getStatement) statement(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'getStatement'>,
  ) {
    return this.reads.read((tx) => this.reads.detail(tx, Number(i.params.id), v))
  }
  @Route(contract.getBusinessStatement) businessStatement(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'getBusinessStatement'>,
  ) {
    return this.reads.read(async (tx) => {
      const detail = await this.reads.detail(tx, Number(i.params.id), v)
      if (
        v.type !== 'admin' &&
        !(detail.kind === 'customer'
          ? v.modules.includes('sales')
          : v.modules.includes('purchase') || v.modules.includes('warehouse'))
      )
        throw appError.notFound()
      return { ...detail, actions: [] }
    })
  }
  @Route(contract.voidStatement) void(@CurrentViewer() v: Viewer, @Input() i: In<'voidStatement'>) {
    return this.writes.void(v, Number(i.params.id), i.body)
  }
  @Route(contract.shareStatement) share(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'shareStatement'>,
  ) {
    return this.reads.read(async (tx) => {
      const d = await this.reads.detail(tx, Number(i.params.id), v)
      if (d.status === 'voided') throw appError.businessRule(statementCopy.voidedShare)
      const shareData = contract.shareStatement.response.shape.shareData.parse(d)
      return { generatedAt: this.reads.clock.now().toISOString(), shareData }
    })
  }
  @Route(contract.listUnsettledCustomerStatements) unsettledCustomer(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'listUnsettledCustomerStatements'>,
  ) {
    return this.reads.read((tx) => this.reads.unsettled(tx, v, 'customer', Number(i.params.id)))
  }
  @Route(contract.listUnsettledSupplierStatements) unsettledSupplier(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'listUnsettledSupplierStatements'>,
  ) {
    return this.reads.read((tx) => this.reads.unsettled(tx, v, 'supplier', Number(i.params.id)))
  }
  @Route(contract.customerTerms) customerTerms(@Input() i: In<'customerTerms'>) {
    return this.reads.read((tx) => this.reads.terms(tx, 'customer', Number(i.params.id)))
  }
  @Route(contract.supplierTerms) supplierTerms(@Input() i: In<'supplierTerms'>) {
    return this.reads.read((tx) => this.reads.terms(tx, 'supplier', Number(i.params.id)))
  }
  @Route(contract.updateCustomerTerms) updateCustomerTerms(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'updateCustomerTerms'>,
  ) {
    return this.writes.terms(v, { kind: 'customer', id: Number(i.params.id) }, i.body)
  }
  @Route(contract.updateSupplierTerms) updateSupplierTerms(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'updateSupplierTerms'>,
  ) {
    return this.writes.terms(v, { kind: 'supplier', id: Number(i.params.id) }, i.body)
  }
  @Route(contract.listReceivables) receivables(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'listReceivables'>,
  ) {
    return this.reads.read((tx) =>
      this.reads.list(tx, v, { ...i.query, status: 'unsettled' }, { kind: 'customer' }),
    )
  }
  @Route(contract.listPayables) payables(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'listPayables'>,
  ) {
    return this.reads.read((tx) =>
      this.reads.list(tx, v, { ...i.query, status: 'unsettled' }, { kind: 'supplier' }),
    )
  }
  @Route(contract.storeStatements) storeStatements(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'storeStatements'>,
  ) {
    return this.reads
      .read((tx) => this.reads.externalList(tx, v, i.query))
      .then((value) => contract.storeStatements.response.parse(value))
  }
  @Route(contract.supplierStatements) supplierStatements(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'supplierStatements'>,
  ) {
    return this.reads
      .read((tx) => this.reads.externalList(tx, v, i.query))
      .then((value) => contract.supplierStatements.response.parse(value))
  }
  @Route(contract.storeStatementDetail) storeStatement(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'storeStatementDetail'>,
  ) {
    return this.reads
      .read((tx) => this.reads.externalDetail(tx, v, Number(i.params.id)))
      .then((value) => contract.storeStatementDetail.response.parse(value))
  }
  @Route(contract.supplierStatementDetail) supplierStatement(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'supplierStatementDetail'>,
  ) {
    return this.reads
      .read((tx) => this.reads.externalDetail(tx, v, Number(i.params.id)))
      .then((value) => contract.supplierStatementDetail.response.parse(value))
  }
  @Route(contract.createReceipt) createReceipt(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'createReceipt'>,
  ) {
    return this.funds
      .create(v, 'receipt', i.body, i.idempotencyKey)
      .then((value) => contract.createReceipt.response.parse(value))
  }
  @Route(contract.createPayment) createPayment(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'createPayment'>,
  ) {
    return this.funds
      .create(v, 'payment', i.body, i.idempotencyKey)
      .then((value) => contract.createPayment.response.parse(value))
  }
  @Route(contract.getReceipt) receipt(@CurrentViewer() v: Viewer, @Input() i: In<'getReceipt'>) {
    return this.reads
      .read((tx) => this.funds.detail(tx, 'receipt', Number(i.params.id), v))
      .then((value) => contract.getReceipt.response.parse(value))
  }
  @Route(contract.getPayment) payment(@CurrentViewer() v: Viewer, @Input() i: In<'getPayment'>) {
    return this.reads
      .read((tx) => this.funds.detail(tx, 'payment', Number(i.params.id), v))
      .then((value) => contract.getPayment.response.parse(value))
  }
  @Route(contract.voidReceipt) voidReceipt(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'voidReceipt'>,
  ) {
    return this.funds
      .void(v, 'receipt', Number(i.params.id), i.body)
      .then((value) => contract.voidReceipt.response.parse(value))
  }
  @Route(contract.voidPayment) voidPayment(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'voidPayment'>,
  ) {
    return this.funds
      .void(v, 'payment', Number(i.params.id), i.body)
      .then((value) => contract.voidPayment.response.parse(value))
  }
  @Route(contract.listFinanceRecords) records(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'listFinanceRecords'>,
  ) {
    return this.reads
      .read((tx) => this.funds.records(tx, v, i.query))
      .then((value) => contract.listFinanceRecords.response.parse(value))
  }
  @Route(contract.createRefund) refund(@CurrentViewer() v: Viewer, @Input() i: In<'createRefund'>) {
    return this.funds.refund(v, i.body, i.idempotencyKey)
  }
  @Route(contract.voidRefund) voidRefund(@CurrentViewer() v: Viewer, @Input() i: In<'voidRefund'>) {
    return this.funds.voidRefund(v, Number(i.params.id), i.body)
  }
  @Route(contract.listMethods) listMethods() {
    return this.methods.list()
  }
  @Route(contract.createMethod) createMethod(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'createMethod'>,
  ) {
    return this.methods.create(v, i.body, i.idempotencyKey)
  }
  @Route(contract.updateMethod) updateMethod(
    @CurrentViewer() v: Viewer,
    @Input() i: In<'updateMethod'>,
  ) {
    return this.methods.setEnabled(v, Number(i.params.id), i.body.enabled)
  }
}
