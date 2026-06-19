/**
 * 计算公式说明生成器
 * 根据合同规则和输入数据，生成人类可读的计算过程描述
 */
import type { ContractFeeRules } from '../schemas/contract.js';

export interface CalculationDetails {
  rent: string;
  property_fee: string;
  electricity: string;
  water: string;
  sewage: string;
  [key: string]: string;
}

/**
 * 生成每项费用的计算公式说明
 */
export function getCalculationDetails(
  rules: ContractFeeRules,
  sales: number,
  elecUsage: number,
  waterUsage: number
): CalculationDetails {
  const details: CalculationDetails = {
    rent: '',
    property_fee: '',
    electricity: '',
    water: '',
    sewage: '',
  };

  // 1. 租金
  if (rules.rent.type === 'take_higher' && rules.rent.fixed && rules.rent.turnover) {
    const fixed = rules.rent.fixed.base_price
      ? rules.rent.fixed.base_price * rules.unit.area
      : (rules.rent.fixed.base_amount ?? 0);
    const turnoverRate = rules.rent.turnover.rate ?? 0;
    const turnover = sales * turnoverRate;
    const minimum = rules.rent.turnover.minimum ?? 0;
    const effectiveTurnover = Math.max(turnover, minimum);
    const rent = Math.max(fixed, effectiveTurnover);

    if (rent === 0) {
      details.rent = '免租期，租金为 0';
    } else if (rent === fixed && fixed >= effectiveTurnover) {
      const turnoverDisplay = turnover >= minimum
        ? `¥${turnover.toLocaleString()} (¥${sales.toLocaleString()}×${(turnoverRate * 100).toFixed(1)}%)`
        : `¥${minimum.toLocaleString()} (保底)`;
      details.rent = `固定 ¥${fixed.toLocaleString()} ≥ 扣率 ${turnoverDisplay}，取固定`;
    } else if (effectiveTurnover === turnover && turnover >= fixed) {
      details.rent = `扣率 ¥${turnover.toLocaleString()} (¥${sales.toLocaleString()}×${(turnoverRate * 100).toFixed(1)}%) > 固定 ¥${fixed.toLocaleString()}，取扣率`;
    } else {
      details.rent = `保底 ¥${minimum.toLocaleString()} > 扣率 ¥${turnover.toLocaleString()}，取保底`;
    }
  } else if (rules.rent.type === 'fixed' && rules.rent.fixed && rules.rent.fixed.base_price) {
    details.rent = `面积 ${rules.unit.area}㎡ × ¥${rules.rent.fixed.base_price}/㎡ = ¥${(rules.unit.area * rules.rent.fixed.base_price).toLocaleString()}`;
  } else if (rules.rent.type === 'turnover' && rules.rent.turnover && rules.rent.turnover.rate) {
    const rate = rules.rent.turnover.rate;
    details.rent = `营业额 ¥${sales.toLocaleString()} × ${(rate * 100).toFixed(1)}% = ¥${(sales * rate).toLocaleString()}`;
  } else if (rules.rent.type === 'tiered' && rules.rent.tiered) {
    details.rent = `阶梯扣率：${rules.rent.tiered.tiers.map((t, i) =>
      `${t.limit ? `≤¥${t.limit.toLocaleString()}` : '>上限'}: ${(t.rate * 100).toFixed(1)}%`
    ).join('；')}`;
  }

  // 2. 物业费
  if (rules.property_fee) {
    details.property_fee = `面积 ${rules.unit.area}㎡ × ¥${rules.property_fee.price}/㎡ = ¥${(rules.unit.area * rules.property_fee.price).toLocaleString()}`;
  } else {
    details.property_fee = '合同未约定物业费';
  }

  // 3. 电费
  if (rules.utilities?.electricity) {
    const elec = rules.utilities.electricity;
    if (elec.price) {
      const base = elecUsage * elec.price;
      const withLoss = base * (1 + elec.loss_rate);
      const total = withLoss * (1 + elec.shared_ratio);
      details.electricity = `用量 ${elecUsage}度 × ¥${elec.price} = ¥${base} + 损耗 ${(elec.loss_rate * 100).toFixed(0)}% + 公摊 ${(elec.shared_ratio * 100).toFixed(0)}% = ¥${total.toFixed(2)}`;
    } else {
      details.electricity = '分时电价 (TOU)，需对接分时数据，当前价格未配置';
    }
  } else {
    details.electricity = '合同未约定电费';
  }

  // 4. 水费
  if (rules.utilities?.water) {
    details.water = `用量 ${waterUsage}吨 × ¥${rules.utilities.water.price}/吨 = ¥${(waterUsage * rules.utilities.water.price).toLocaleString()}`;
  } else {
    details.water = '合同未约定水费';
  }

  // 5. 污水处理费
  if (rules.utilities?.water) {
    details.sewage = `用量 ${waterUsage}吨 × ¥${rules.utilities.water.sewage_rate}/吨 = ¥${(waterUsage * rules.utilities.water.sewage_rate).toLocaleString()}`;
  } else {
    details.sewage = '合同未约定污水处理费';
  }

  // 6. 其他费用
  if (rules.other_fees) {
    for (const [key, value] of Object.entries(rules.other_fees)) {
      const amount = typeof value === 'number' ? value : (value as { amount?: number })?.amount ?? 0;
      const desc = typeof value === 'object' && value !== null && 'amount' in value
        ? `固定 ¥${(value as { amount: number }).amount}`
        : `¥${amount}`;
      details[`other_${key}`] = desc;
    }
  }

  return details;
}