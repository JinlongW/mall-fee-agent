/**
 * 异常检测模块
 * 对比历史数据，检测异常波动
 */

export interface BillHistory {
  period: string;
  total: number;
  rent: number;
  electricity: number;
  water: number;
}

export interface Anomaly {
  type: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * 检测账单异常
 * @param current 本期账单各项费用
 * @param history 近 6 个月历史数据
 */
export function detectAnomalies(
  current: { rent: number; electricity: number; water: number; total: number },
  history: BillHistory[]
): Anomaly[] {
  if (history.length < 2) return [];

  const anomalies: Anomaly[] = [];

  // 1. 总费用环比波动 > 20%
  const lastMonth = history[history.length - 1];
  const totalChangeRate = Math.abs(current.total - lastMonth.total) / lastMonth.total;
  if (totalChangeRate > 0.2) {
    anomalies.push({
      type: 'total_fluctuation',
      message: `总费用环比波动 ${(totalChangeRate * 100).toFixed(1)}%，超过 20% 阈值`,
      severity: totalChangeRate > 0.5 ? 'high' : 'medium',
    });
  }

  // 2. 电费异常波动
  const avgElec = history.reduce((sum, h) => sum + h.electricity, 0) / history.length;
  if (avgElec > 0 && current.electricity > avgElec * 1.5) {
    anomalies.push({
      type: 'electricity_spike',
      message: `电费 ${(current.electricity).toFixed(0)} 元，超出 6 个月均值 ${(avgElec).toFixed(0)} 元 50%+`,
      severity: 'high',
    });
  }

  // 3. 租金为 0 但不在免租期
  if (current.rent === 0 && lastMonth.rent > 0) {
    anomalies.push({
      type: 'rent_zero',
      message: '租金为 0 但上月有租金，请确认是否在免租期',
      severity: 'medium',
    });
  }

  // 4. 水费异常
  const avgWater = history.reduce((sum, h) => sum + h.water, 0) / history.length;
  if (avgWater > 0 && current.water > avgWater * 2) {
    anomalies.push({
      type: 'water_spike',
      message: `水费异常偏高，超出均值 2 倍+`,
      severity: 'medium',
    });
  }

  return anomalies;
}
