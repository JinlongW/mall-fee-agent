/**
 * 数据库 Schema 定义
 *
 * 表结构：
 *   contracts  - 合同信息 + 费用规则（JSON）
 *   bills      - 每月生成的账单
 *   bill_items - 账单明细项（租金/物业费/水电费等）
 */
import {
  pgTable,
  text,
  integer,
  numeric,
  timestamp,
  uuid,
  jsonb,
  boolean,
  index,
} from 'drizzle-orm/pg-core';

// =============================================================
// 合同表
// =============================================================

export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contractId: text('contract_id').notNull(), // 客户原始合同编号
    merchantName: text('merchant_name').notNull(),
    businessType: text('business_type').notNull(), // 餐饮/零售/娱乐/服务/超市/其他
    unitId: text('unit_id').notNull(), // 铺位编号
    floor: text('floor').notNull(),
    area: numeric('area', { precision: 10, scale: 2 }).notNull(), // 面积 ㎡
    leaseStart: text('lease_start').notNull(), // YYYY-MM-DD
    leaseEnd: text('lease_end').notNull(),
    freeRentStart: text('free_rent_start'), // 免租期开始
    freeRentEnd: text('free_rent_end'), // 免租期结束
    rentType: text('rent_type').notNull(), // fixed/turnover/take_higher/tiered
    rentRules: jsonb('rent_rules').notNull(), // 完整租金规则 JSON
    propertyFeeRules: jsonb('property_fee_rules'),
    utilityRules: jsonb('utility_rules'),
    otherFeeRules: jsonb('other_fee_rules'),
    lateFeeRules: jsonb('late_fee_rules'),
    rawContractText: text('raw_contract_text'), // 原始合同文本
    sourcePdf: text('source_pdf'), // PDF base64 或 URL
    sourcePages: integer('source_pages'), // PDF 页数
    aiConfidence: numeric('ai_confidence', { precision: 3, scale: 2 }), // AI 置信度
    needsReview: boolean('needs_review').default(false),
    reviewedBy: text('reviewed_by'), // 审核人
    reviewedAt: timestamp('reviewed_at'),
    status: text('status').notNull().default('draft'), // draft/reviewed/active/archived
    notes: text('notes').array(), // 备注
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    idxContractId: index('idx_contracts_contract_id').on(table.contractId),
    idxUnitId: index('idx_contracts_unit_id').on(table.unitId),
    idxStatus: index('idx_contracts_status').on(table.status),
    idxLeasePeriod: index('idx_contracts_lease_period').on(table.leaseStart, table.leaseEnd),
  })
);

// =============================================================
// 账单表
// =============================================================

export const bills = pgTable(
  'bills',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contractId: text('contract_id').notNull(), // 关联合同的 contract_id
    period: text('period').notNull(), // YYYY-MM
    merchantName: text('merchant_name').notNull(),
    unitId: text('unit_id').notNull(),
    sales: numeric('sales', { precision: 12, scale: 2 }), // 月营业额
    electricityUsage: numeric('electricity_usage', { precision: 10, scale: 2 }), // 用电量
    waterUsage: numeric('water_usage', { precision: 10, scale: 2 }), // 用水量
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(), // 总金额
    anomalies: jsonb('anomalies'), // 异常检测 JSON
    status: text('status').notNull().default('draft'), // draft/reviewed/confirmed/sent/paid
    pdfUrl: text('pdf_url'), // 账单 PDF 地址
    paidAt: timestamp('paid_at'), // 付款时间
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    idxContractPeriod: index('idx_bills_contract_period').on(table.contractId, table.period),
    idxStatus: index('idx_bills_status').on(table.status),
    idxPeriod: index('idx_bills_period').on(table.period),
  })
);

// =============================================================
// 账单明细表
// =============================================================

export const billItems = pgTable(
  'bill_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    billId: uuid('bill_id').notNull(), // 关联账单
    itemKey: text('item_key').notNull(), // rent/property_fee/electricity/water/sewage/other_*
    itemName: text('item_name').notNull(), // 显示名
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    formula: text('formula'), // 计算公式说明
    unitPrice: numeric('unit_price', { precision: 10, scale: 4 }), // 单价
    quantity: numeric('quantity', { precision: 10, scale: 2 }), // 数量
    remarks: text('remarks'), // 备注
  },
  (table) => ({
    idxBillId: index('idx_bill_items_bill_id').on(table.billId),
    idxItemKey: index('idx_bill_items_item_key').on(table.itemKey),
  })
);

// =============================================================
// TypeScript 类型导出
// =============================================================

export type Contract = typeof contracts.$inferSelect;
export type NewContract = typeof contracts.$inferInsert;

export type Bill = typeof bills.$inferSelect;
export type NewBill = typeof bills.$inferInsert;

export type BillItem = typeof billItems.$inferSelect;
export type NewBillItem = typeof billItems.$inferInsert;
