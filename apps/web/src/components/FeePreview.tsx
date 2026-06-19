/**
 * Step 3: 费用预览
 * 输入营业额 + 抄表数据 → 实时计算当月账单
 */
import { useState, useMemo } from 'react';
import {
  Card, Row, Col, Form, InputNumber, Button, Statistic, Descriptions,
  Tag, Space, Alert, Divider, Table, Tooltip, Typography
} from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { calcMonthlyFees } from '@mall/fee-engine';
import type { CalcOutput } from '@mall/fee-engine';
import type { ContractFeeRules } from '@mall/shared';

const { Text } = Typography;

interface Props {
  rules: ContractFeeRules;
  onBack: () => void;
}

/**
 * 生成每项费用的计算公式说明
 */
function getCalculationDetails(rules: ContractFeeRules, _period: string, sales: number, elecUsage: number, waterUsage: number) {
  const details: Record<string, string> = {};

  // 1. 租金
  if (rules.rent.type === 'take_higher' && rules.rent.fixed && rules.rent.turnover) {
    const fixed = rules.rent.fixed.base_price ? (rules.rent.fixed.base_price * rules.unit.area) : (rules.rent.fixed.base_amount ?? 0);
    const turnoverRate = rules.rent.turnover.rate ?? 0;
    const turnover = sales * turnoverRate;
    const minimum = rules.rent.turnover.minimum ?? 0;
    const effectiveTurnover = Math.max(turnover, minimum);
    const rent = Math.max(fixed, effectiveTurnover);

    if (rent === 0) {
      details.rent = '免租期，租金为 0';
    } else if (rent === fixed && fixed >= effectiveTurnover) {
      details.rent = `固定 ¥${fixed.toLocaleString()} ≥ 扣率 ¥${effectiveTurnover.toLocaleString()}，取固定`;
    } else if (turnover >= minimum && turnover >= fixed) {
      details.rent = `扣率 ¥${turnover.toLocaleString()} (¥${sales.toLocaleString()}×${(turnoverRate*100).toFixed(1)}%) > 固定 ¥${fixed.toLocaleString()}，取扣率`;
    } else {
      details.rent = `保底 ¥${minimum.toLocaleString()} > 扣率 ¥${turnover.toLocaleString()}，取保底`;
    }
  } else if (rules.rent.type === 'fixed' && rules.rent.fixed && rules.rent.fixed.base_price) {
    details.rent = `面积 ${rules.unit.area}㎡ × ¥${rules.rent.fixed.base_price}/㎡ = ¥${(rules.unit.area * rules.rent.fixed.base_price).toLocaleString()}`;
  } else if (rules.rent.type === 'turnover' && rules.rent.turnover && rules.rent.turnover.rate) {
    const rate = rules.rent.turnover.rate;
    details.rent = `营业额 ¥${sales.toLocaleString()} × ${(rate*100).toFixed(1)}% = ¥${(sales * rate).toLocaleString()}`;
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
      details.electricity = `用量 ${elecUsage}度 × ¥${elec.price} = ¥${base} + 损耗 ${elec.loss_rate*100}% + 公摊 ${elec.shared_ratio*100}% = ¥${total.toFixed(2)}`;
    } else {
      details.electricity = `分时电价 (TOU)，需对接分时数据，当前价格未配置`;
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
      const amount = typeof value === 'number' ? value : (value as any)?.amount ?? 0;
      details[`other_${key}`] = typeof value === 'object' && value !== null && 'amount' in value ? `固定 ¥${(value as any).amount}` : `¥${amount}`;
    }
  }

  return details;
}

export function FeePreview({ rules, onBack }: Props) {
  // 默认值：第一个免租期之后的月份
  const today = new Date();
  const defaultPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const [period, setPeriod] = useState(defaultPeriod);
  const [sales, setSales] = useState(200000);
  const [elecCurrent, setElecCurrent] = useState(12000);
  const [elecPrevious, setElecPrevious] = useState(10000);
  const [waterCurrent, setWaterCurrent] = useState(80);
  const [waterPrevious, setWaterPrevious] = useState(50);

  // 实时计算
  const bill: CalcOutput | null = useMemo(() => {
    try {
      return calcMonthlyFees({
        rules,
        period,
        meters: {
          elec_current: elecCurrent,
          elec_previous: elecPrevious,
          water_current: waterCurrent,
          water_previous: waterPrevious,
        },
        sales,
        history: [],
      });
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [rules, period, sales, elecCurrent, elecPrevious, waterCurrent, waterPrevious]);

  const elecUsage = elecCurrent - elecPrevious;
  const waterUsage = waterCurrent - waterPrevious;
  const calcDetails = getCalculationDetails(rules, period, sales, elecUsage, waterUsage);

  const exportJson = () => {
    if (!bill) return;
    const data = {
      contract_id: rules.contract_id,
      merchant: rules.merchant.name,
      unit: rules.unit.unit_id,
      period,
      sales,
      meters: { elecCurrent, elecPrevious, waterCurrent, waterPrevious },
      bill,
      calcDetails,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bill-${rules.contract_id}-${period}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card
      title={
        <Space>
          <span>🧮 费用预览</span>
          <Tag color="cyan">{period}</Tag>
        </Space>
      }
      extra={
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
            返回编辑
          </Button>
          <Button icon={<DownloadOutlined />} onClick={exportJson}>
            导出账单 JSON
          </Button>
        </Space>
      }
    >
      <Row gutter={16}>
        <Col span={10}>
          <Card type="inner" title="📊 输入数据">
            <Form layout="vertical">
              <Form.Item label="账期">
                <input
                  type="month"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '4px 11px',
                    border: '1px solid #d9d9d9',
                    borderRadius: 6,
                  }}
                />
              </Form.Item>

              <Form.Item label="月营业额 (元)">
                <InputNumber
                  value={sales}
                  onChange={(v) => setSales(v ?? 0)}
                  min={0}
                  step={10000}
                  style={{ width: '100%' }}
                  formatter={(v) => `¥ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v) => Number(v?.replace(/¥\s?|,/g, '') ?? 0)}
                />
              </Form.Item>

              <Divider plain>电表读数</Divider>
              <Row gutter={8}>
                <Col span={12}>
                  <Form.Item label="上期">
                    <InputNumber
                      value={elecPrevious}
                      onChange={(v) => setElecPrevious(v ?? 0)}
                      min={0}
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="本期">
                    <InputNumber
                      value={elecCurrent}
                      onChange={(v) => setElecCurrent(v ?? 0)}
                      min={0}
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Divider plain>水表读数</Divider>
              <Row gutter={8}>
                <Col span={12}>
                  <Form.Item label="上期">
                    <InputNumber
                      value={waterPrevious}
                      onChange={(v) => setWaterPrevious(v ?? 0)}
                      min={0}
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="本期">
                    <InputNumber
                      value={waterCurrent}
                      onChange={(v) => setWaterCurrent(v ?? 0)}
                      min={0}
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </Card>
        </Col>

        <Col span={14}>
          <Card type="inner" title="💰 账单明细">
            {bill ? (
              <>
                {bill.anomalies.length > 0 && (
                  <Alert
                    message="检测到异常"
                    description={
                      <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
                        {bill.anomalies.map((a, i) => (
                          <li key={i}>
                            <Tag color={a.severity === 'high' ? 'red' : a.severity === 'medium' ? 'orange' : 'blue'}>
                              {a.severity}
                            </Tag>
                            {a.message}
                          </li>
                        ))}
                      </ul>
                    }
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                  />
                )}

                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col span={12}>
                    <Statistic
                      title="应付总额"
                      value={bill.total}
                      precision={2}
                      prefix="¥"
                      valueStyle={{ color: '#cf1322', fontSize: 32 }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="营业额"
                      value={sales}
                      precision={0}
                      prefix="¥"
                      valueStyle={{ fontSize: 24 }}
                    />
                  </Col>
                </Row>

                <Table
                  size="small"
                  pagination={false}
                  dataSource={[
                    { key: 'rent', name: '租金', amount: bill.rent, color: 'red', detail: calcDetails.rent },
                    { key: 'property', name: '物业费', amount: bill.property_fee, color: 'orange', detail: calcDetails.property_fee },
                    { key: 'electricity', name: '电费', amount: bill.electricity, color: 'gold', detail: calcDetails.electricity },
                    { key: 'water', name: '水费', amount: bill.water, color: 'blue', detail: calcDetails.water },
                    { key: 'sewage', name: '污水处理费', amount: bill.sewage, color: 'cyan', detail: calcDetails.sewage },
                    ...Object.entries(bill.other_fees).map(([k, v]) => ({
                      key: `other_${k}`,
                      name: k,
                      amount: v,
                      color: 'purple',
                      detail: calcDetails[`other_${k}`],
                    })),
                  ]}
                  columns={[
                    {
                      title: '费用项',
                      dataIndex: 'name',
                      width: 120,
                      render: (v, r) => <Tag color={r.color}>{v}</Tag>,
                    },
                    {
                      title: (
                        <span>
                          计算公式
                          <Tooltip title="每项费用的具体计算过程">
                            <InfoCircleOutlined style={{ marginLeft: 4, color: '#999' }} />
                          </Tooltip>
                        </span>
                      ),
                      dataIndex: 'detail',
                      render: (v: string) => (
                        <Text style={{ fontSize: 12, color: '#666', fontFamily: 'monospace' }}>
                          {v}
                        </Text>
                      ),
                    },
                    {
                      title: '金额 (元)',
                      dataIndex: 'amount',
                      align: 'right',
                      width: 120,
                      render: (v) => (
                        <Text strong style={{ color: v > 0 ? '#cf1322' : '#999' }}>
                          ¥ {v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                        </Text>
                      ),
                    },
                  ]}
                  summary={(data) => {
                    const total = data.reduce((sum, r) => sum + (r.amount as number), 0);
                    return (
                      <Table.Summary fixed>
                        <Table.Summary.Row style={{ background: '#fafafa' }}>
                          <Table.Summary.Cell index={0} colSpan={1}><b>合计</b></Table.Summary.Cell>
                          <Table.Summary.Cell index={1} colSpan={1}></Table.Summary.Cell>
                          <Table.Summary.Cell index={2} colSpan={1} align="right">
                            <b style={{ color: '#cf1322', fontSize: 16 }}>
                              ¥ {total.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                            </b>
                          </Table.Summary.Cell>
                        </Table.Summary.Row>
                      </Table.Summary>
                    );
                  }}
                />

                <Divider />

                <Descriptions title="计算说明" column={2} size="small" bordered>
                  <Descriptions.Item label="电表用量">
                    {elecUsage} 度
                  </Descriptions.Item>
                  <Descriptions.Item label="水表用量">
                    {waterUsage} 吨
                  </Descriptions.Item>
                  <Descriptions.Item label="营业扣率" span={2}>
                    {rules.rent.turnover?.rate
                      ? `${(rules.rent.turnover.rate * 100).toFixed(1)}%`
                      : '-'}
                  </Descriptions.Item>
                  {rules.lease_period.free_rent && rules.lease_period.free_rent.start && rules.lease_period.free_rent.end && (
                    <Descriptions.Item label="免租期" span={2}>
                      <Tag color="green">
                        {rules.lease_period.free_rent.start} ~ {rules.lease_period.free_rent.end}
                      </Tag>
                      {bill.rent === 0 && period >= rules.lease_period.free_rent.start && period <= rules.lease_period.free_rent.end.slice(0, 7) ? (
                        <Tag color="cyan">本月在免租期内，租金为 0</Tag>
                      ) : null}
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </>
            ) : (
              <Alert
                message="计算失败"
                description="请检查输入数据和合同规则是否完整"
                type="error"
              />
            )}
          </Card>
        </Col>
      </Row>
    </Card>
  );
}