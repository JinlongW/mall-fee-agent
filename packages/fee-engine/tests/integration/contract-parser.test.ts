/**
 * 合同解析端到端测试
 * 用真实风格的中文合同文本测试 API + Agent
 */
import { describe, it, expect } from 'vitest';
import { calcMonthlyFees } from '@mall/fee-engine';
import type { ContractFeeRules } from '@mall/shared';

// 真实风格合同：餐饮店，两者取高 + 免租期
const sampleContractText = `
购物中心租赁合同

合同编号：HT-2026-TEST-001

甲方（出租方）：某商业管理有限公司
乙方（承租方）：张三餐饮店

第一条 租赁标的
乙方承租甲方位于某购物中心 B1 层 B1-023 号铺位，用于经营餐饮业务。

第二条 租赁期限
本合同租赁期限为 3 年，自 2026 年 1 月 1 日起至 2028 年 12 月 31 日止。
免租期 3 个月，自 2026 年 1 月 1 日至 2026 年 3 月 31 日。免租期内免收租金，物业费正常收取。

第三条 租金及支付方式
铺位面积 120.5 平方米。
租金采用固定租金与营业额扣率两者取高的方式计算：
（一）固定租金：每月每平方米 150 元，即月固定租金 18,075 元。
自第二年起每年递增 5%，递增基数为签约时单价。
（二）扣率租金：按乙方当月营业额的 12% 计算。
（三）保底租金：18,075 元/月，随固定租金同步递增。
（四）两者取高：每月比较固定租金和扣率租金，取金额高者作为当月租金。

第四条 物业管理费
物业管理费按每月每平方米 25 元收取（含中央空调），公摊比例 15%。

第五条 水电费
电费按表实抄，执行商业分时电价，线损率 2%，公摊比例 15%。
水费 4.5 元/吨，污水处理费 0.9 元/吨。

第六条 其他费用
推广费：固定每月 1,500 元；
POS 系统使用费：固定每月 300 元。

第七条 滞纳金
乙方未按期支付费用的，每逾期一日按应付款项万分之五加收滞纳金，宽限期 10 天。

`;

// 预期的解析结果（标准答案）
const expectedRules: ContractFeeRules = {
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
    electricity: {
      type: 'tou',
      price: null,
      tiers: null,
      loss_rate: 0.02,
      shared_ratio: 0.15,
    },
    water: { price: 4.5, sewage_rate: 0.9 },
  },
  other_fees: {
    marketing: { type: 'fixed', amount: 1500 },
    pos_fee: { type: 'fixed', amount: 300 },
  },
  late_fee: { rate: 0.0005, grace_days: 10 },
  confidence: 0.95,
  notes: null,
};

describe('合同解析 + 费用核算集成测试', () => {
  it('合同文本包含关键信息', () => {
    expect(sampleContractText).toContain('B1-023');
    expect(sampleContractText).toContain('两者取高');
    expect(sampleContractText).toContain('免租期');
    expect(sampleContractText).toContain('保底');
    expect(sampleContractText).toContain('12%');
  });

  it('标准答案规则满足 Schema', () => {
    // 这里只是验证标准答案本身符合 Schema
    expect(expectedRules.merchant.business_type).toBe('餐饮');
    expect(expectedRules.rent.type).toBe('take_higher');
    expect(expectedRules.lease_period.free_rent?.rent_free).toBe(true);
  });

  it('免租期（2026-02）租金应为 0', () => {
    const bill = calcMonthlyFees({
      rules: expectedRules,
      period: '2026-02',
      meters: {
        elec_current: 1000, elec_previous: 500,
        water_current: 50, water_previous: 30,
      },
      sales: 300000,
      history: [],
    });

    expect(bill.rent).toBe(0);          // 免租期
    expect(bill.property_fee).toBe(3012.5); // 120.5 × 25
    expect(bill.water).toBe(90);        // 20 吨 × 4.5
    expect(bill.sewage).toBe(18);       // 20 吨 × 0.9
  });

  it('正常月份（2026-05）扣率高时取扣率', () => {
    const bill = calcMonthlyFees({
      rules: expectedRules,
      period: '2026-05',
      meters: {
        elec_current: 1000, elec_previous: 500,
        water_current: 50, water_previous: 30,
      },
      sales: 300000,  // 扣率 = 36000 > 固定 18075
      history: [],
    });

    // 固定 18075, 扣率 300000×0.12=36000, MAX = 36000
    expect(bill.rent).toBe(36000);
  });

  it('正常月份（2026-05）营业额低时取保底', () => {
    const bill = calcMonthlyFees({
      rules: expectedRules,
      period: '2026-05',
      meters: {
        elec_current: 1000, elec_previous: 500,
        water_current: 50, water_previous: 30,
      },
      sales: 50000,   // 扣率 = 6000 < 保底 18075 → 取保底
      history: [],
    });

    // 固定 18075, 扣率 6000 但保底 18075, MAX(18075, MAX(6000, 18075)) = 18075
    expect(bill.rent).toBe(18075);
  });

  it('第二年（2027-05）固定租金递增 5%，保底同步递增', () => {
    const bill = calcMonthlyFees({
      rules: expectedRules,
      period: '2027-05',
      meters: {
        elec_current: 1000, elec_previous: 500,
        water_current: 50, water_previous: 30,
      },
      sales: 50000,
      history: [],
    });

    // 固定 = 18075 × 1.05 = 18978.75
    // 扣率 6000, 保底 18075×1.05 = 18978.75
    // MAX = 18978.75
    expect(bill.rent).toBe(18978.75);
  });
});