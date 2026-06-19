/**
 * 合同服务 - 数据库操作
 */
import { eq, desc, and, gte, lte } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { contracts as contractsTable, type Contract, type NewContract } from '../db/schema.js';

export interface ContractFilter {
  status?: string;
  businessType?: string;
  unitId?: string;
  leaseStart?: string;
  leaseEnd?: string;
}

export interface PaginatedContracts {
  data: Contract[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export class ContractService {
  /**
   * 创建合同
   */
  static async create(contract: NewContract): Promise<Contract> {
    const [newContract] = await db.insert(contractsTable).values(contract).returning();
    return newContract;
  }

  /**
   * 根据 ID 获取合同
   */
  static async getById(id: string): Promise<Contract | undefined> {
    const [contract] = await db.select().from(contractsTable).where(eq(contractsTable.id, id));
    return contract;
  }

  /**
   * 根据合同编号获取合同
   */
  static async getByContractId(contractId: string): Promise<Contract | undefined> {
    const [contract] = await db
      .select()
      .from(contractsTable)
      .where(eq(contractsTable.contractId, contractId));
    return contract;
  }

  /**
   * 分页查询合同列表
   */
  static async list(
    filter: ContractFilter = {},
    page = 1,
    pageSize = 20
  ): Promise<PaginatedContracts> {
    const conditions = [];

    if (filter.status) {
      conditions.push(eq(contractsTable.status, filter.status));
    }
    if (filter.businessType) {
      conditions.push(eq(contractsTable.businessType, filter.businessType));
    }
    if (filter.unitId) {
      conditions.push(eq(contractsTable.unitId, filter.unitId));
    }
    if (filter.leaseStart) {
      conditions.push(gte(contractsTable.leaseEnd, filter.leaseStart));
    }
    if (filter.leaseEnd) {
      conditions.push(lte(contractsTable.leaseStart, filter.leaseEnd));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // 查询总数
    const [{ count }] = await db
      .select({ count: contractsTable.id })
      .from(contractsTable)
      .where(where);

    // 查询分页数据
    const data = await db
      .select()
      .from(contractsTable)
      .where(where)
      .orderBy(desc(contractsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const total = Number(count);
    const totalPages = Math.ceil(total / pageSize);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * 更新合同
   */
  static async update(id: string, updates: Partial<Contract>): Promise<Contract | undefined> {
    const [updated] = await db
      .update(contractsTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(contractsTable.id, id))
      .returning();
    return updated;
  }

  /**
   * 审核合同
   */
  static async review(
    id: string,
    reviewedBy: string,
    approved: boolean
  ): Promise<Contract | undefined> {
    return this.update(id, {
      reviewedBy,
      reviewedAt: new Date(),
      status: approved ? 'active' : 'draft',
      needsReview: false,
    });
  }

  /**
   * 归档合同
   */
  static async archive(id: string): Promise<Contract | undefined> {
    return this.update(id, { status: 'archived' });
  }

  /**
   * 删除合同
   */
  static async delete(id: string): Promise<void> {
    await db.delete(contractsTable).where(eq(contractsTable.id, id));
  }

  /**
   * 统计合同数量
   */
  static async count(status?: string): Promise<number> {
    const where = status ? eq(contractsTable.status, status) : undefined;
    const [{ count }] = await db
      .select({ count: contractsTable.id })
      .from(contractsTable)
      .where(where);
    return Number(count);
  }

  /**
   * 获取即将到期的合同
   */
  static async getExpiringContracts(monthsAhead = 6): Promise<Contract[]> {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setMonth(endDate.getMonth() + monthsAhead);

    const result = await db
      .select()
      .from(contractsTable)
      .where(
        and(
          eq(contractsTable.status, 'active'),
          lte(contractsTable.leaseEnd, endDate.toISOString().split('T')[0]),
          gte(contractsTable.leaseEnd, today.toISOString().split('T')[0])
        )
      )
      .orderBy(desc(contractsTable.leaseEnd));

    return result;
  }
}