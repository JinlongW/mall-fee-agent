/**
 * 租金计算测试
 */
import { describe, it, expect } from 'vitest';
import { calcFixedRent, calcTieredRent, calcRent, isInFreeRentPeriod } from '../src/rent.js';
import type { ContractFeeRules } from '@mall/shared';

const baseRules: ContractFeeRules = {
  contract_id: 'TEST-001',
  merchant: { name: '测试商户', business_type: '餐饮' },
  unit: { unit_id: 'B1-001', floor: 'B1', area: 100 },
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
    type: 'fixed',
    fixed: {
      base_price: 150,
      base_amount: null,
      escalation: { frequency: 'yearly', rate: 0.05, base: 'contract_start' },
    },
    turnover: null,
    tiered: null,
  },
  property_fee: { price: 25, includes_ac: false, shared_ratio: 0.15 },
  utilities: null,
  other_fees: null,
  late_fee: null,
  confidence: 1.0,
  notes: null,
};

describe('isInFreeRentPeriod', () => {
  it('免租期内返回 true', () => {
    expect(isInFreeRentPeriod(baseRules, '2026-02')).toBe(true);
  });
  it('免租期后返回 false', () => {
    expect(isInFreeRentPeriod(baseRules, '2026-04')).toBe(false);
  });
});

describe('calcFixedRent', () => {
  it('第一年无递增', () => {
    expect(calcFixedRent(baseRules, '2026-04')).toBe(15000);
  });
  it('第二年递增 5%', () => {
    expect(calcFixedRent(baseRules, '2027-04')).toBe(15750);
  });
  it('第三年递增 10%', () => {
    expect(calcFixedRent(baseRules, '2028-04')).toBe(16537.5);
  });
});

describe('calcTieredRent', () => {
  const tiers = [
    { limit: 100000, rate: 0.08 },
    { limit: 300000, rate: 0.12 },
    { limit: null, rate: 0.15 },
  ];
  it('低营业额', () => {
    expect(calcTieredRent(tiers, 50000)).toBe(4000);
  });
  it('中等营业额', () => {
    expect(calcTieredRent(tiers, 200000)).toBe(20000);
  });
  it('高营业额', () => {
    expect(calcTieredRent(tiers, 500000)).toBe(59000);
  });
});

describe('calcRent - 两者取高', () => {
  const takeHighRules: ContractFeeRules = {
    ...baseRules,
    rent: {
      type: 'take_higher',
      fixed: { base_price: 150, base_amount: null, escalation: null },
      turnover: { rate: 0.12, minimum: 18000, minimum_escalates: false },
      tiered: null,
    },
  };
  it('营业额高时取扣率', () => {
    expect(calcRent(takeHighRules, '2026-04', 200000)).toBe(24000);
  });
  it('营业额低时取固定', () => {
    expect(calcRent(takeHighRules, '2026-04', 100000)).toBe(15000);
  });
  it('免租期内为 0', () => {
    expect(calcRent(takeHighRules, '2026-02', 200000)).toBe(0);
  });
});
