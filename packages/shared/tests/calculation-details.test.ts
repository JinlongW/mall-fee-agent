/**
 * 计算公式说明生成器 - 全面测试
 * 覆盖：4 种租金模式 + 物业费 + 水电费 + 其他费用 + 边界情况
 */
import { describe, it, expect } from 'vitest';
import { getCalculationDetails } from '../src/utils/calculation-details.js';
import type { ContractFeeRules } from '../src/schemas/contract.js';

// =============================================================
// 测试工厂：快速构造规则对象
// =============================================================

function baseRules(overrides: Partial<ContractFeeRules> = {}): ContractFeeRules {
  return {
    contract_id: 'TEST-001',
    merchant: { name: '测试商户', business_type: '餐饮' },
    unit: { unit_id: 'B1-001', floor: 'B1', area: 100 },
    lease_period: {
      start: '2026-01-01',
      end: '2028-12-31',
      free_rent: null,
    },
    rent: {
      type: 'fixed',
      fixed: { base_price: 150, base_amount: null, escalation: null },
      turnover: null,
      tiered: null,
    },
    property_fee: { price: 25, includes_ac: false, shared_ratio: 0.15 },
    utilities: {
      electricity: { type: 'flat', price: 0.85, tiers: null, loss_rate: 0.02, shared_ratio: 0.15 },
      water: { price: 4.5, sewage_rate: 0.9 },
    },
    other_fees: null,
    late_fee: null,
    confidence: 1.0,
    notes: null,
    ...overrides,
  };
}

// =============================================================
// 1. 租金 — 两者取高（核心场景）
// =============================================================

describe('getCalculationDetails — 两者取高', () => {
  const takeHigherRules = baseRules({
    rent: {
      type: 'take_higher',
      fixed: { base_price: 150, base_amount: 15000, escalation: null },
      turnover: { rate: 0.12, minimum: 15000, minimum_escalates: false },
      tiered: null,
    },
  });

  it('营业额高 → 取扣率', () => {
    const d = getCalculationDetails(takeHigherRules, 200000, 2000, 30);
    expect(d.rent).toBe('扣率 ¥24,000 (¥200,000×12.0%) > 固定 ¥15,000，取扣率');
  });

  it('营业额低 → 取固定', () => {
    const d = getCalculationDetails(takeHigherRules, 50000, 2000, 30);
    // 扣率 = 50000×12% = 6000, 保底 = 15000, effectiveTurnover = 15000
    // 固定 = 15000 ≥ effectiveTurnover = 15000 → 取固定
    expect(d.rent).toBe('固定 ¥15,000 ≥ 扣率 ¥15,000 (保底)，取固定');
  });

  it('扣率超过保底但低于固定 → 取保底（保底 > 扣率）', () => {
    const rules = baseRules({
      rent: {
        type: 'take_higher',
        fixed: { base_price: 200, base_amount: 20000, escalation: null },
        turnover: { rate: 0.10, minimum: 15000, minimum_escalates: false },
        tiered: null,
      },
    });
    const d = getCalculationDetails(rules, 120000, 2000, 30);
    // 扣率 = 120000×10% = 12000, 保底 = 15000, effectiveTurnover = 15000
    // 固定 = 20000 ≥ effectiveTurnover = 15000 → 取固定
    expect(d.rent).toBe('固定 ¥20,000 ≥ 扣率 ¥15,000 (保底)，取固定');
  });

  it('营业额 = 0 → 取保底', () => {
    const d = getCalculationDetails(takeHigherRules, 0, 2000, 30);
    // 扣率 = 0, 保底 = 15000, effectiveTurnover = 15000
    // 固定 = 15000 ≥ effectiveTurnover = 15000 → 取固定
    expect(d.rent).toBe('固定 ¥15,000 ≥ 扣率 ¥15,000 (保底)，取固定');
  });

  it('扣率 > 保底且 > 固定 → 取扣率', () => {
    const d = getCalculationDetails(takeHigherRules, 300000, 2000, 30);
    // 扣率 = 300000×12% = 36000, 保底 = 15000, effectiveTurnover = 36000
    // 固定 = 15000 < effectiveTurnover = 36000 → 取扣率
    expect(d.rent).toBe('扣率 ¥36,000 (¥300,000×12.0%) > 固定 ¥15,000，取扣率');
  });
});

// =============================================================
// 2. 租金 — 固定
// =============================================================

describe('getCalculationDetails — 固定租金', () => {
  it('正常计算', () => {
    const rules = baseRules();
    const d = getCalculationDetails(rules, 100000, 2000, 30);
    expect(d.rent).toBe('面积 100㎡ × ¥150/㎡ = ¥15,000');
  });

  it('大面积', () => {
    const rules = baseRules({
      unit: { unit_id: 'L1-105', floor: 'L1', area: 300 },
      rent: {
        type: 'fixed',
        fixed: { base_price: 180, base_amount: 54000, escalation: null },
        turnover: null,
        tiered: null,
      },
    });
    const d = getCalculationDetails(rules, 100000, 2000, 30);
    expect(d.rent).toBe('面积 300㎡ × ¥180/㎡ = ¥54,000');
  });
});

// =============================================================
// 3. 租金 — 纯扣率
// =============================================================

describe('getCalculationDetails — 纯扣率', () => {
  it('正常扣率', () => {
    const rules = baseRules({
      rent: {
        type: 'turnover',
        fixed: null,
        turnover: { rate: 0.10, minimum: null, minimum_escalates: false },
        tiered: null,
      },
    });
    const d = getCalculationDetails(rules, 250000, 2000, 30);
    expect(d.rent).toBe('营业额 ¥250,000 × 10.0% = ¥25,000');
  });
});

// =============================================================
// 4. 租金 — 阶梯扣率
// =============================================================

describe('getCalculationDetails — 阶梯扣率', () => {
  it('三级阶梯描述', () => {
    const rules = baseRules({
      rent: {
        type: 'tiered',
        fixed: null,
        turnover: null,
        tiered: {
          tiers: [
            { limit: 100000, rate: 0.08 },
            { limit: 300000, rate: 0.12 },
            { limit: null, rate: 0.15 },
          ],
        },
      },
    });
    const d = getCalculationDetails(rules, 500000, 2000, 30);
    expect(d.rent).toBe('阶梯扣率：≤¥100,000: 8.0%；≤¥300,000: 12.0%；>上限: 15.0%');
  });
});

// =============================================================
// 5. 物业费
// =============================================================

describe('getCalculationDetails — 物业费', () => {
  it('有物业费', () => {
    const rules = baseRules();
    const d = getCalculationDetails(rules, 100000, 2000, 30);
    expect(d.property_fee).toBe('面积 100㎡ × ¥25/㎡ = ¥2,500');
  });

  it('无物业费', () => {
    const rules = baseRules({ property_fee: null });
    const d = getCalculationDetails(rules, 100000, 2000, 30);
    expect(d.property_fee).toBe('合同未约定物业费');
  });
});

// =============================================================
// 6. 电费
// =============================================================

describe('getCalculationDetails — 电费', () => {
  it('固定单价 + 损耗 + 公摊', () => {
    const rules = baseRules();
    const d = getCalculationDetails(rules, 100000, 2000, 30);
    // 2000 × 0.85 = 1700, 1700 × 1.02 = 1734, 1734 × 1.15 = 1994.10
    expect(d.electricity).toBe('用量 2000度 × ¥0.85 = ¥1700 + 损耗 2% + 公摊 15% = ¥1994.10');
  });

  it('分时电价（无固定单价）', () => {
    const rules = baseRules({
      utilities: {
        electricity: { type: 'tou', price: null, tiers: null, loss_rate: 0.02, shared_ratio: 0.15 },
        water: { price: 4.5, sewage_rate: 0.9 },
      },
    });
    const d = getCalculationDetails(rules, 100000, 2000, 30);
    expect(d.electricity).toBe('分时电价 (TOU)，需对接分时数据，当前价格未配置');
  });

  it('无电费配置', () => {
    const rules = baseRules({
      utilities: {
        electricity: null,
        water: { price: 4.5, sewage_rate: 0.9 },
      },
    });
    const d = getCalculationDetails(rules, 100000, 2000, 30);
    expect(d.electricity).toBe('合同未约定电费');
  });
});

// =============================================================
// 7. 水费 + 污水处理费
// =============================================================

describe('getCalculationDetails — 水费', () => {
  it('正常水费 + 污水处理', () => {
    const rules = baseRules();
    const d = getCalculationDetails(rules, 100000, 2000, 30);
    expect(d.water).toBe('用量 30吨 × ¥4.5/吨 = ¥135');
    expect(d.sewage).toBe('用量 30吨 × ¥0.9/吨 = ¥27');
  });

  it('零用量', () => {
    const rules = baseRules();
    const d = getCalculationDetails(rules, 100000, 2000, 0);
    expect(d.water).toBe('用量 0吨 × ¥4.5/吨 = ¥0');
    expect(d.sewage).toBe('用量 0吨 × ¥0.9/吨 = ¥0');
  });

  it('无水费配置', () => {
    const rules = baseRules({
      utilities: {
        electricity: { type: 'flat', price: 0.85, tiers: null, loss_rate: 0.02, shared_ratio: 0.15 },
        water: null,
      },
    });
    const d = getCalculationDetails(rules, 100000, 2000, 30);
    expect(d.water).toBe('合同未约定水费');
    expect(d.sewage).toBe('合同未约定污水处理费');
  });
});

// =============================================================
// 8. 其他费用
// =============================================================

describe('getCalculationDetails — 其他费用', () => {
  it('固定金额其他费用', () => {
    const rules = baseRules({
      other_fees: {
        marketing: { type: 'fixed', amount: 2000 },
        pos_fee: 500,
      },
    });
    const d = getCalculationDetails(rules, 100000, 2000, 30);
    expect(d.other_marketing).toBe('固定 ¥2000');
    expect(d.other_pos_fee).toBe('¥500');
  });

  it('无其他费用', () => {
    const rules = baseRules({ other_fees: null });
    const d = getCalculationDetails(rules, 100000, 2000, 30);
    expect(d.other_marketing).toBeUndefined();
  });
});

// =============================================================
// 9. 真实场景集成（Mock 模式解析结果）
// =============================================================

describe('getCalculationDetails — 真实场景', () => {
  // 模拟 Mock 模式解析的真实合同
  const mockContractResult: ContractFeeRules = {
    contract_id: 'HT-2026-TEST-001',
    merchant: { name: '张三餐饮店', business_type: '餐饮' },
    unit: { unit_id: 'B1-023', floor: 'B1', area: 120.5 },
    lease_period: {
      start: '2026-01-01',
      end: '2028-12-31',
      free_rent: {
        start: '2026-01-01',
        end: '2026-03-31',
        rent_free: true,
        property_fee_free: false,
        method: 'direct',
      },
    },
    rent: {
      type: 'take_higher',
      fixed: {
        base_price: 150,
        base_amount: 18075,
        escalation: { frequency: 'yearly', rate: 0.05, base: 'contract_start' },
      },
      turnover: { rate: 0.12, minimum: 18075, minimum_escalates: true },
      tiered: null,
    },
    property_fee: { price: 25, includes_ac: true, shared_ratio: 0.15 },
    utilities: {
      electricity: { type: 'flat', price: 0.85, tiers: null, loss_rate: 0.02, shared_ratio: 0.15 },
      water: { price: 4.5, sewage_rate: 0.9 },
    },
    other_fees: null,
    late_fee: { rate: 0.0005, grace_days: 10 },
    confidence: 0.88,
    notes: ['Mock 模式'],
  };

  it('营业额 200,000 → 扣率 > 固定', () => {
    const d = getCalculationDetails(mockContractResult, 200000, 2000, 30);
    // 扣率 = 200000×12% = 24000, 固定 = 120.5×150 = 18075
    expect(d.rent).toBe('扣率 ¥24,000 (¥200,000×12.0%) > 固定 ¥18,075，取扣率');
    expect(d.property_fee).toBe('面积 120.5㎡ × ¥25/㎡ = ¥3,012.5');
    expect(d.electricity).toBe('用量 2000度 × ¥0.85 = ¥1700 + 损耗 2% + 公摊 15% = ¥1994.10');
    expect(d.water).toBe('用量 30吨 × ¥4.5/吨 = ¥135');
    expect(d.sewage).toBe('用量 30吨 × ¥0.9/吨 = ¥27');
  });

  it('营业额 250,000 → 扣率更高', () => {
    const d = getCalculationDetails(mockContractResult, 250000, 2000, 30);
    // 扣率 = 250000×12% = 30000
    expect(d.rent).toBe('扣率 ¥30,000 (¥250,000×12.0%) > 固定 ¥18,075，取扣率');
  });

  it('营业额 100,000 → 扣率 < 保底 → 取保底', () => {
    const d = getCalculationDetails(mockContractResult, 100000, 2000, 30);
    // 扣率 = 100000×12% = 12000, 保底 = 18075, effectiveTurnover = 18075
    // 固定 = 18075 ≥ effectiveTurnover = 18075 → 取固定
    expect(d.rent).toBe('固定 ¥18,075 ≥ 扣率 ¥18,075 (保底)，取固定');
  });

  it('营业额 0 → 取保底', () => {
    const d = getCalculationDetails(mockContractResult, 0, 2000, 30);
    // 扣率 = 0, 保底 = 18075, effectiveTurnover = 18075
    expect(d.rent).toBe('固定 ¥18,075 ≥ 扣率 ¥18,075 (保底)，取固定');
  });
});
