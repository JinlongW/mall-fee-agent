/**
 * 合同费用规则 Schema
 * 从租赁合同中提取的结构化费用计算规则
 */
import { z } from 'zod';

// =============================================================
// 基本信息
// =============================================================

export const MerchantSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  business_type: z.enum(['餐饮', '零售', '娱乐', '服务', '超市', '其他']),
});

export const UnitSchema = z.object({
  unit_id: z.string(),
  floor: z.string(),
  area: z.number().positive(),
});

export const LeasePeriodSchema = z.object({
  start: z.string(),
  end: z.string(),
  free_rent: z.object({
    start: z.string().nullable(),
    end: z.string().nullable(),
    rent_free: z.boolean(),
    property_fee_free: z.boolean(),
    method: z.enum(['direct', 'spread', 'refund']).nullable(),
  }).nullable(),
});

// =============================================================
// 租金规则
// =============================================================

export const EscalationSchema = z.object({
  frequency: z.enum(['yearly', 'bi_yearly', 'tri_yearly']).nullable(),
  rate: z.number().nullable(),
  base: z.enum(['contract_start', 'previous']).nullable(),
});

export const FixedRentSchema = z.object({
  base_price: z.number().nullable(),
  base_amount: z.number().nullable(),
  escalation: EscalationSchema.nullable(),
});

export const TurnoverRentSchema = z.object({
  rate: z.number().nullable(),
  minimum: z.number().nullable(),
  minimum_escalates: z.boolean().nullable(),
});

export const TierSchema = z.object({
  limit: z.number().nullable(),
  rate: z.number(),
});

export const TieredRentSchema = z.object({
  tiers: z.array(TierSchema),
});

export const RentSchema = z.object({
  type: z.enum(['fixed', 'turnover', 'take_higher', 'tiered']),
  fixed: FixedRentSchema.nullable(),
  turnover: TurnoverRentSchema.nullable(),
  tiered: TieredRentSchema.nullable(),
});

// =============================================================
// 物业费
// =============================================================

export const PropertyFeeSchema = z.object({
  price: z.number(),
  includes_ac: z.boolean(),
  shared_ratio: z.number(),
}).nullable();

// =============================================================
// 水电费
// =============================================================

export const ElectricityTierSchema = z.object({
  limit: z.number().nullable(),
  peak: z.number(),
  valley: z.number(),
  flat: z.number(),
});

export const ElectricitySchema = z.object({
  type: z.enum(['flat', 'tiered', 'tou', 'tiered_tou']),
  price: z.number().nullable(),
  tiers: z.array(ElectricityTierSchema).nullable(),
  loss_rate: z.number(),
  shared_ratio: z.number(),
}).nullable();

export const WaterSchema = z.object({
  price: z.number(),
  sewage_rate: z.number(),
}).nullable();

export const UtilitiesSchema = z.object({
  electricity: ElectricitySchema,
  water: WaterSchema,
}).nullable();

// =============================================================
// 其他费用 + 滞纳金
// =============================================================

export const OtherFeesSchema = z.record(z.any()).nullable();

export const LateFeeSchema = z.object({
  rate: z.number(),
  grace_days: z.number(),
}).nullable();

// =============================================================
// 完整合同费用规则
// =============================================================

export const ContractFeeRulesSchema = z.object({
  contract_id: z.string(),
  merchant: MerchantSchema,
  unit: UnitSchema,
  lease_period: LeasePeriodSchema,
  rent: RentSchema,
  property_fee: PropertyFeeSchema,
  utilities: UtilitiesSchema,
  other_fees: OtherFeesSchema,
  late_fee: LateFeeSchema,
  confidence: z.number().min(0).max(1),
  notes: z.array(z.string()).nullable(),
});

export type ContractFeeRules = z.infer<typeof ContractFeeRulesSchema>;
export type Merchant = z.infer<typeof MerchantSchema>;
export type Unit = z.infer<typeof UnitSchema>;
export type Rent = z.infer<typeof RentSchema>;
export type PropertyFee = z.infer<typeof PropertyFeeSchema>;
export type Utilities = z.infer<typeof UtilitiesSchema>;
export type LateFee = z.infer<typeof LateFeeSchema>;
