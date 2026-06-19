/**
 * 账单服务 - 数据库操作
 */
import { eq, desc, and, gte, lte } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { bills, billItems, type Bill } from '../db/schema.js';
import type { CalcOutput } from '@mall/fee-engine';
import type { ContractFeeRules } from '@mall/shared';
import { calcMonthlyFees } from '@mall/fee-engine';
import { getCalculationDetails } from '@mall/shared';

export interface BillFilter {
  contractId?: string;
  period?: string;
  periodStart?: string;
  periodEnd?: string;
  status?: string;
}

export interface PaginatedBills {
  data: (Bill & { items: Array<Record<string, unknown>> })[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface GenerateBillInput {
  contractId: string;
  period: string; // YYYY-MM
  sales: number;
  elecCurrent: number;
  elecPrevious: number;
  waterCurrent: number;
  waterPrevious: number;
}

export class BillService {
  /**
   * 根据合同规则生成账单（不保存）
   */
  static calculateBill(
    rules: ContractFeeRules,
    input: Omit<GenerateBillInput, 'contractId'>
  ): { bill: CalcOutput; details: Record<string, string> } {
    const elecUsage = input.elecCurrent - input.elecPrevious;
    const waterUsage = input.waterCurrent - input.waterPrevious;

    const bill = calcMonthlyFees({
      rules,
      period: input.period,
      meters: {
        elec_current: input.elecCurrent,
        elec_previous: input.elecPrevious,
        water_current: input.waterCurrent,
        water_previous: input.waterPrevious,
      },
      sales: input.sales,
      history: [],
    });

    const details = getCalculationDetails(rules, input.sales, elecUsage, waterUsage);

    return { bill, details };
  }

  /**
   * 生成并保存账单
   */
  static async generate(input: GenerateBillInput): Promise<Bill> {
    const rules = await this.getContractRules(input.contractId);
    if (!rules) {
      throw new Error(`合同 ${input.contractId} 不存在`);
    }

    const { bill, details } = this.calculateBill(rules, {
      period: input.period,
      sales: input.sales,
      elecCurrent: input.elecCurrent,
      elecPrevious: input.elecPrevious,
      waterCurrent: input.waterCurrent,
      waterPrevious: input.waterPrevious,
    });

    // 保存账单主表
    const [newBill] = await db
      .insert(bills)
      .values({
        contractId: input.contractId,
        period: input.period,
        merchantName: rules.merchant.name,
        unitId: rules.unit.unit_id,
        sales: input.sales.toString(),
        electricityUsage: (input.elecCurrent - input.elecPrevious).toString(),
        waterUsage: (input.waterCurrent - input.waterPrevious).toString(),
        totalAmount: bill.total.toString(),
        anomalies: JSON.stringify(bill.anomalies),
        status: 'draft',
      })
      .returning();

    // 保存账单明细
    const items: Array<[string, string, number, string]> = [
      ['rent', '租金', bill.rent, details.rent],
      ['property_fee', '物业费', bill.property_fee, details.property_fee],
      ['electricity', '电费', bill.electricity, details.electricity],
      ['water', '水费', bill.water, details.water],
      ['sewage', '污水处理费', bill.sewage, details.sewage],
    ];

    // 其他费用
    for (const [key, value] of Object.entries(bill.other_fees)) {
      items.push([`other_${key}`, key, value, details[`other_${key}`] ?? '']);
    }

    await db.insert(billItems).values(
      items.map(([itemKey, itemName, amount, formula]) => ({
        billId: newBill.id,
        itemKey,
        itemName,
        amount: amount.toString(),
        formula,
      }))
    );

    return newBill;
  }

  /**
   * 获取合同规则（从数据库加载）
   */
  private static async getContractRules(contractId: string): Promise<ContractFeeRules | null> {
    // 这里简化处理，实际应该从 contract-service 获取
    const [{ ContractService }] = await Promise.all([
      import('./contract-service.js'),
    ]);

    const contract = await ContractService.getByContractId(contractId);
    if (!contract) return null;

    // 从 JSON 字段重建规则对象
    return {
      contract_id: contract.contractId,
      merchant: {
        name: contract.merchantName,
        business_type: contract.businessType as ContractFeeRules['merchant']['business_type'],
      },
      unit: {
        unit_id: contract.unitId,
        floor: contract.floor,
        area: Number(contract.area),
      },
      lease_period: {
        start: contract.leaseStart,
        end: contract.leaseEnd,
        free_rent: contract.freeRentStart && contract.freeRentEnd
          ? {
              start: contract.freeRentStart,
              end: contract.freeRentEnd,
              rent_free: true,
              property_fee_free: false,
              method: 'direct',
            }
          : null,
      },
      rent: contract.rentRules as ContractFeeRules['rent'],
      property_fee: (contract.propertyFeeRules ?? null) as ContractFeeRules['property_fee'],
      utilities: (contract.utilityRules ?? null) as ContractFeeRules['utilities'],
      other_fees: (contract.otherFeeRules ?? null) as ContractFeeRules['other_fees'],
      late_fee: (contract.lateFeeRules ?? null) as ContractFeeRules['late_fee'],
      confidence: Number(contract.aiConfidence ?? 0),
      notes: contract.notes ?? null,
    };
  }

  /**
   * 获取账单详情（含明细）
   */
  static async getById(id: string): Promise<(Bill & { items: Array<Record<string, unknown>> }) | undefined> {
    const [bill] = await db.select().from(bills).where(eq(bills.id, id));
    if (!bill) return undefined;

    const items = await db
      .select()
      .from(billItems)
      .where(eq(billItems.billId, bill.id));

    return { ...bill, items };
  }

  /**
   * 分页查询账单列表
   */
  static async list(
    filter: BillFilter = {},
    page = 1,
    pageSize = 20
  ): Promise<PaginatedBills> {
    const conditions = [];

    if (filter.contractId) {
      conditions.push(eq(bills.contractId, filter.contractId));
    }
    if (filter.period) {
      conditions.push(eq(bills.period, filter.period));
    }
    if (filter.periodStart) {
      conditions.push(gte(bills.period, filter.periodStart));
    }
    if (filter.periodEnd) {
      conditions.push(lte(bills.period, filter.periodEnd));
    }
    if (filter.status) {
      conditions.push(eq(bills.status, filter.status));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ count }] = await db
      .select({ count: bills.id })
      .from(bills)
      .where(where);

    const data = await db
      .select()
      .from(bills)
      .where(where)
      .orderBy(desc(bills.period), desc(bills.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const total = Number(count);
    const totalPages = Math.ceil(total / pageSize);

    // 加载每个账单的明细
    const billsWithItems = await Promise.all(
      data.map(async (bill) => {
        const items = await db
          .select()
          .from(billItems)
          .where(eq(billItems.billId, bill.id));
        return { ...bill, items };
      })
    );

    return {
      data: billsWithItems,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * 确认账单
   */
  static async confirm(id: string): Promise<Bill | undefined> {
    const [bill] = await db
      .update(bills)
      .set({ status: 'confirmed', updatedAt: new Date() })
      .where(eq(bills.id, id))
      .returning();
    return bill;
  }

  /**
   * 标记已付款
   */
  static async markPaid(id: string): Promise<Bill | undefined> {
    const [bill] = await db
      .update(bills)
      .set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() })
      .where(eq(bills.id, id))
      .returning();
    return bill;
  }

  /**
   * 删除账单
   */
  static async delete(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(billItems).where(eq(billItems.billId, id));
      await tx.delete(bills).where(eq(bills.id, id));
    });
  }

  /**
   * 统计应收/实收/欠费
   */
  static async getStatistics(period?: string) {
    const where = period ? eq(bills.period, period) : undefined;

    const [totalStats] = await db
      .select({
        totalAmount: bills.totalAmount,
        status: bills.status,
      })
      .from(bills)
      .where(where);

    // 这里简化处理，实际应该用聚合查询
    return {
      period: period ?? 'all',
      message: '统计功能待完善',
    };
  }
}
