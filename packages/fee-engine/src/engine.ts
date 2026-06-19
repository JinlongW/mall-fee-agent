/**
 * 费用核算引擎
 * 核心计算入口：输入规则 + 数据 → 输出账单
 */
import type { ContractFeeRules } from '@mall/shared';
import { calcRent } from './rent.js';
import { calcElectricity, calcWater, type MeterReadings } from './utilities.js';
import { detectAnomalies, type BillHistory } from './anomaly.js';

export interface CalcInput {
  rules: ContractFeeRules;
  period: string;
  meters: MeterReadings;
  sales: number;
  history: BillHistory[];
}

export interface CalcOutput {
  merchant_id: string;
  period: string;
  rent: number;
  property_fee: number;
  electricity: number;
  water: number;
  sewage: number;
  other_fees: Record<string, number>;
  total: number;
  anomalies: Array<{ type: string; message: string; severity: string }>;
  created_at: string;
}

/**
 * 计算月度费用
 */
export function calcMonthlyFees(input: CalcInput): CalcOutput {
  const { rules, period, meters, sales, history } = input;

  // 1. 租金
  const rent = calcRent(rules, period, sales);

  // 2. 物业费
  const propertyFee = rules.property_fee
    ? rules.unit.area * rules.property_fee.price
    : 0;

  // 3. 电费
  const electricity = calcElectricity(meters, rules.utilities);

  // 4. 水费 + 污水处理
  const { water, sewage } = calcWater(meters, rules.utilities);

  // 5. 其他费用
  const otherFees: Record<string, number> = {};
  if (rules.other_fees) {
    for (const [key, value] of Object.entries(rules.other_fees)) {
      if (typeof value === 'number') {
        otherFees[key] = value;
      } else if (typeof value === 'object' && value !== null && 'amount' in value) {
        otherFees[key] = (value as { amount: number }).amount;
      }
    }
  }

  // 6. 汇总
  const total = rent + propertyFee + electricity + water + sewage
    + Object.values(otherFees).reduce((a, b) => a + b, 0);

  // 7. 异常检测
  const anomalies = detectAnomalies(
    { rent, electricity, water, total },
    history
  );

  return {
    merchant_id: rules.merchant.id ?? rules.contract_id,
    period,
    rent: Math.round(rent * 100) / 100,
    property_fee: Math.round(propertyFee * 100) / 100,
    electricity,
    water,
    sewage,
    other_fees: otherFees,
    total: Math.round(total * 100) / 100,
    anomalies,
    created_at: new Date().toISOString(),
  };
}
