/**
 * 水电费计算模块
 */
import type { ContractFeeRules } from '@mall/shared';

export interface MeterReadings {
  elec_current: number;
  elec_previous: number;
  water_current: number;
  water_previous: number;
}

/**
 * 电费计算（支持固定/阶梯/分时/阶梯分时 4 种模式）
 */
export function calcElectricity(
  meters: MeterReadings,
  config: ContractFeeRules['utilities']
): number {
  const elec = config?.electricity;
  if (!elec) return 0;

  const usage = meters.elec_current - meters.elec_previous;
  if (usage <= 0) return 0;

  let baseCost = 0;

  switch (elec.type) {
    case 'flat':
      baseCost = usage * (elec.price ?? 0);
      break;

    case 'tiered':
      baseCost = calcTieredUsage(usage, elec.tiers ?? []);
      break;

    case 'tou':
      baseCost = usage * (elec.price ?? 0);
      break;

    case 'tiered_tou':
      baseCost = calcTieredUsage(usage, elec.tiers ?? []);
      break;

    default:
      baseCost = usage * (elec.price ?? 0);
  }

  const withLoss = baseCost * (1 + elec.loss_rate);
  const total = withLoss * (1 + elec.shared_ratio);

  return Math.round(total * 100) / 100;
}

function calcTieredUsage(
  usage: number,
  tiers: Array<{ limit: number | null; peak: number; valley: number; flat: number }>
): number {
  let total = 0;
  let remaining = usage;
  let prevLimit = 0;

  for (const tier of tiers) {
    if (remaining <= 0) break;
    const tierSize = tier.limit !== null ? tier.limit - prevLimit : Infinity;
    const tierUsage = Math.min(remaining, tierSize);
    total += tierUsage * tier.flat;
    remaining -= tierSize;
    prevLimit = tier.limit ?? prevLimit;
  }

  return total;
}

/**
 * 水费 + 污水处理费计算
 */
export function calcWater(
  meters: MeterReadings,
  config: ContractFeeRules['utilities']
): { water: number; sewage: number } {
  const water = config?.water;
  if (!water) return { water: 0, sewage: 0 };

  const usage = meters.water_current - meters.water_previous;
  if (usage <= 0) return { water: 0, sewage: 0 };

  return {
    water: Math.round(usage * water.price * 100) / 100,
    sewage: Math.round(usage * water.sewage_rate * 100) / 100,
  };
}
