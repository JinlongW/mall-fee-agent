/**
 * 租金计算模块
 * 支持 4 种模式：固定/扣率/两者取高/阶梯
 */
import type { ContractFeeRules, Rent } from '@mall/shared';

/**
 * 计算两个日期之间的月份差
 */
export function monthsBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
}

/**
 * 判断是否在免租期内
 */
export function isInFreeRentPeriod(rules: ContractFeeRules, period: string): boolean {
  const freeRent = rules.lease_period.free_rent;
  if (!freeRent?.start || !freeRent?.end) return false;
  if (!freeRent.rent_free) return false;

  const periodDate = new Date(period + '-01');
  const startDate = new Date(freeRent.start);
  const endDate = new Date(freeRent.end);

  return periodDate >= startDate && periodDate <= endDate;
}

/**
 * 固定租金计算（含递增）
 */
export function calcFixedRent(rules: ContractFeeRules, period: string): number {
  const fixed = rules.rent.fixed;
  if (!fixed) return 0;

  const basePrice = fixed.base_price ?? (fixed.base_amount ? fixed.base_amount / rules.unit.area : 0);
  const escalation = fixed.escalation;

  if (!escalation?.rate || !escalation.frequency) {
    return rules.unit.area * basePrice;
  }

  const monthsElapsed = monthsBetween(rules.lease_period.start, period);
  const yearsElapsed = Math.floor(monthsElapsed / 12);

  const price = escalation.base === 'previous'
    ? Array.from({ length: yearsElapsed }).reduce(
        (p) => p * (1 + escalation.rate), basePrice)
    : basePrice * Math.pow(1 + escalation.rate, yearsElapsed);

  return rules.unit.area * price;
}

/**
 * 阶梯扣率租金计算
 */
export function calcTieredRent(
  tiers: Array<{ limit: number | null; rate: number }>,
  sales: number
): number {
  let total = 0;
  let remaining = sales;
  let prevLimit = 0;

  for (const tier of tiers) {
    if (remaining <= 0) break;
    const tierSize = tier.limit !== null ? tier.limit - prevLimit : Infinity;
    total += Math.min(remaining, tierSize) * tier.rate;
    remaining -= tierSize;
    prevLimit = tier.limit ?? prevLimit;
  }

  return total;
}

/**
 * 扣率租金计算
 */
export function calcTurnoverRent(rent: Rent, sales: number): number {
  const turnover = rent.turnover;
  if (!turnover?.rate) return 0;

  const amount = sales * turnover.rate;
  const minimum = turnover.minimum ?? 0;
  return Math.max(amount, minimum);
}

/**
 * 租金总入口：根据模式分发
 */
export function calcRent(rules: ContractFeeRules, period: string, sales: number): number {
  if (isInFreeRentPeriod(rules, period)) return 0;

  const rent = rules.rent;

  switch (rent.type) {
    case 'fixed':
      return calcFixedRent(rules, period);

    case 'turnover':
      return calcTurnoverRent(rent, sales);

    case 'take_higher': {
      const fixed = calcFixedRent(rules, period);
      const turnover = calcTurnoverRent(rent, sales);
      return Math.max(fixed, turnover);
    }

    case 'tiered':
      return rent.tiered ? calcTieredRent(rent.tiered.tiers, sales) : 0;

    default:
      return 0;
  }
}
