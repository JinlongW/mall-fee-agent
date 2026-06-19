/**
 * Step 2: 解析结果展示 + 编辑
 * 双视图：JSON 视图 + 表单视图
 */
import { useState } from 'react';
import {
  Card, Tabs, Form, Input, InputNumber, Select, Button, Space, Alert, Tag,
  Row, Col, Descriptions, Divider, message
} from 'antd';
import { EditOutlined, CodeOutlined, CheckOutlined, SaveOutlined } from '@ant-design/icons';
import type { ContractFeeRules } from '@mall/shared';

interface Props {
  originalRules: ContractFeeRules;
  editingRules: ContractFeeRules;
  contractText: string;
  onChange: (rules: ContractFeeRules) => void;
  onConfirm: () => void;
  onBack: () => void;
}

const BUSINESS_TYPES = ['餐饮', '零售', '娱乐', '服务', '超市', '其他'] as const;

const RENT_TYPES: Array<{ value: 'fixed' | 'turnover' | 'take_higher' | 'tiered'; label: string }> = [
  { value: 'fixed', label: '固定租金' },
  { value: 'turnover', label: '扣率租金' },
  { value: 'take_higher', label: '两者取高' },
  { value: 'tiered', label: '阶梯扣率' },
];

const ESCALATION_BASES: Array<{ value: 'contract_start' | 'previous'; label: string }> = [
  { value: 'contract_start', label: '按签约价' },
  { value: 'previous', label: '按上期' },
];

export function ParseResultViewer({
  originalRules,
  editingRules,
  contractText,
  onChange,
  onConfirm,
  onBack,
}: Props) {
  const [jsonText, setJsonText] = useState(JSON.stringify(editingRules, null, 2));
  const [saving, setSaving] = useState(false);

  // 保存到数据库
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_id: editingRules.contract_id,
          merchant_name: editingRules.merchant.name,
          business_type: editingRules.merchant.business_type,
          unit_id: editingRules.unit.unit_id,
          floor: editingRules.unit.floor,
          area: editingRules.unit.area,
          lease_start: editingRules.lease_period.start,
          lease_end: editingRules.lease_period.end,
          free_rent_start: editingRules.lease_period.free_rent?.start ?? null,
          free_rent_end: editingRules.lease_period.free_rent?.end ?? null,
          rent_type: editingRules.rent.type,
          rent_rules: editingRules.rent,
          property_fee_rules: editingRules.property_fee,
          utility_rules: editingRules.utilities,
          other_fee_rules: editingRules.other_fees,
          late_fee_rules: editingRules.late_fee,
          raw_contract_text: contractText,
          ai_confidence: editingRules.confidence,
          needs_review: editingRules.confidence < 0.8,
          notes: editingRules.notes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        message.success(`合同已保存（ID: ${data.data.id.slice(0, 8)}...）`);
      } else {
        message.error(`保存失败：${data.error}`);
      }
    } catch (e) {
      message.error(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof ContractFeeRules>(
    key: K,
    value: ContractFeeRules[K]
  ) => {
    onChange({ ...editingRules, [key]: value });
  };

  const updateMerchant = (field: 'name' | 'business_type', value: string) => {
    onChange({ ...editingRules, merchant: { ...editingRules.merchant, [field]: value } });
  };

  const updateUnit = (field: 'unit_id' | 'floor' | 'area', value: string | number) => {
    onChange({ ...editingRules, unit: { ...editingRules.unit, [field]: value } });
  };

  const updateLeasePeriod = (field: 'start' | 'end', value: string) => {
    onChange({
      ...editingRules,
      lease_period: { ...editingRules.lease_period, [field]: value },
    });
  };

  const updateRentType = (type: ContractFeeRules['rent']['type']) => {
    onChange({
      ...editingRules,
      rent: { ...editingRules.rent, type },
    });
  };

  const updateFixed = (field: 'base_price' | 'base_amount', value: number | null) => {
    onChange({
      ...editingRules,
      rent: {
        ...editingRules.rent,
        fixed: editingRules.rent.fixed
          ? { ...editingRules.rent.fixed, [field]: value }
          : { base_price: null, base_amount: null, escalation: null, [field]: value },
      },
    });
  };

  const updateEscalation = (field: 'rate', value: number | null) => {
    if (!editingRules.rent.fixed) return;
    onChange({
      ...editingRules,
      rent: {
        ...editingRules.rent,
        fixed: {
          ...editingRules.rent.fixed,
          escalation: editingRules.rent.fixed.escalation
            ? { ...editingRules.rent.fixed.escalation, [field]: value }
            : { frequency: 'yearly', rate: value, base: 'contract_start' },
        },
      },
    });
  };

  const updateTurnover = (field: 'rate' | 'minimum', value: number | null) => {
    onChange({
      ...editingRules,
      rent: {
        ...editingRules.rent,
        turnover: editingRules.rent.turnover
          ? { ...editingRules.rent.turnover, [field]: value }
          : { rate: value, minimum: null, minimum_escalates: false, [field]: value },
      },
    });
  };

  const updatePropertyFee = (field: 'price' | 'shared_ratio', value: number) => {
    onChange({
      ...editingRules,
      property_fee: editingRules.rent.fixed
        ? {
            ...(editingRules.property_fee ?? { price: 0, includes_ac: false, shared_ratio: 0 }),
            [field]: value,
          }
        : editingRules.property_fee,
    });
  };

  const handleJsonSave = () => {
    try {
      const parsed = JSON.parse(jsonText);
      onChange(parsed);
      message.success('JSON 已应用');
    } catch (e) {
      message.error(`JSON 格式错误：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const isModified = JSON.stringify(editingRules) !== JSON.stringify(originalRules);
  const isLowConfidence = editingRules.confidence < 0.8;

  return (
    <Card
      title={
        <Space>
          <span>🤖 AI 解析结果</span>
          <Tag color={isLowConfidence ? 'orange' : 'green'}>
            置信度 {(editingRules.confidence * 100).toFixed(0)}%
          </Tag>
          {isModified && <Tag color="blue">已修改</Tag>}
        </Space>
      }
      extra={
        <Space>
          <Button onClick={onBack}>返回上一步</Button>
          <Button
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSave}
          >
            保存到数据库
          </Button>
          <Button type="primary" icon={<CheckOutlined />} onClick={onConfirm}>
            确认规则
          </Button>
        </Space>
      }
    >
      {isLowConfidence && (
        <Alert
          message="置信度较低"
          description="建议人工核对以下字段，特别是免租期、保底递增、递增基准等边界规则。"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Tabs
        items={[
          {
            key: 'form',
            label: <span><EditOutlined /> 表单视图</span>,
            children: (
              <Form layout="vertical">
                <Divider orientation="left">基本信息</Divider>
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item label="合同编号">
                      <Input
                        value={editingRules.contract_id}
                        onChange={(e) => updateField('contract_id', e.target.value)}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="商户名称">
                      <Input
                        value={editingRules.merchant.name}
                        onChange={(e) => updateMerchant('name', e.target.value)}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="业态">
                      <Select
                        value={editingRules.merchant.business_type}
                        onChange={(v) => updateMerchant('business_type', v)}
                        options={BUSINESS_TYPES.map((t) => ({ value: t, label: t }))}
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item label="铺位编号">
                      <Input
                        value={editingRules.unit.unit_id}
                        onChange={(e) => updateUnit('unit_id', e.target.value)}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="楼层">
                      <Input
                        value={editingRules.unit.floor}
                        onChange={(e) => updateUnit('floor', e.target.value)}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="面积 (㎡)">
                      <InputNumber
                        value={editingRules.unit.area}
                        onChange={(v) => updateUnit('area', v ?? 0)}
                        min={0}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Divider orientation="left">租赁期限</Divider>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label="开始日期">
                      <Input
                        value={editingRules.lease_period.start}
                        onChange={(e) => updateLeasePeriod('start', e.target.value)}
                        placeholder="YYYY-MM-DD"
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="结束日期">
                      <Input
                        value={editingRules.lease_period.end}
                        onChange={(e) => updateLeasePeriod('end', e.target.value)}
                        placeholder="YYYY-MM-DD"
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Divider orientation="left">租金规则</Divider>
                <Form.Item label="租金模式">
                  <Select
                    value={editingRules.rent.type}
                    onChange={updateRentType}
                    options={RENT_TYPES}
                    style={{ width: 200 }}
                  />
                </Form.Item>

                {(editingRules.rent.type === 'fixed' || editingRules.rent.type === 'take_higher') && (
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item label="固定单价 (元/㎡/月)">
                        <InputNumber
                          value={editingRules.rent.fixed?.base_price ?? undefined}
                          onChange={(v) => updateFixed('base_price', v ?? null)}
                          min={0}
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item label="递增率 (%)">
                        <InputNumber
                          value={
                            editingRules.rent.fixed?.escalation?.rate
                              ? editingRules.rent.fixed.escalation.rate * 100
                              : undefined
                          }
                          onChange={(v) => updateEscalation('rate', v != null ? v / 100 : null)}
                          min={0}
                          max={100}
                          step={0.5}
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item label="递增基准">
                        <Select
                          value={editingRules.rent.fixed?.escalation?.base ?? 'contract_start'}
                          onChange={(v) => {
                            if (!editingRules.rent.fixed) return;
                            onChange({
                              ...editingRules,
                              rent: {
                                ...editingRules.rent,
                                fixed: {
                                  ...editingRules.rent.fixed,
                                  escalation: {
                                    ...(editingRules.rent.fixed.escalation ?? { frequency: 'yearly', rate: 0 }),
                                    base: v,
                                  },
                                },
                              },
                            });
                          }}
                          options={ESCALATION_BASES}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                )}

                {(editingRules.rent.type === 'turnover' || editingRules.rent.type === 'take_higher') && (
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item label="扣率 (%)">
                        <InputNumber
                          value={editingRules.rent.turnover?.rate ? editingRules.rent.turnover.rate * 100 : undefined}
                          onChange={(v) => updateTurnover('rate', v != null ? v / 100 : null)}
                          min={0}
                          max={100}
                          step={0.5}
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item label="保底租金 (元)">
                        <InputNumber
                          value={editingRules.rent.turnover?.minimum ?? undefined}
                          onChange={(v) => updateTurnover('minimum', v ?? null)}
                          min={0}
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                )}

                <Divider orientation="left">物业费</Divider>
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item label="物业单价 (元/㎡/月)">
                      <InputNumber
                        value={editingRules.property_fee?.price}
                        onChange={(v) => updatePropertyFee('price', v ?? 0)}
                        min={0}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="公摊比例 (%)">
                      <InputNumber
                        value={editingRules.property_fee ? editingRules.property_fee.shared_ratio * 100 : 0}
                        onChange={(v) => updatePropertyFee('shared_ratio', (v ?? 0) / 100)}
                        min={0}
                        max={100}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Form>
            ),
          },
          {
            key: 'json',
            label: <span><CodeOutlined /> JSON 视图</span>,
            children: (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Input.TextArea
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  rows={20}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
                <Space>
                  <Button onClick={handleJsonSave}>应用 JSON</Button>
                  <Button onClick={() => setJsonText(JSON.stringify(editingRules, null, 2))}>
                    重置
                  </Button>
                </Space>
              </Space>
            ),
          },
          {
            key: 'original',
            label: '合同原文',
            children: (
              <pre style={{
                background: '#f5f5f5',
                padding: 16,
                borderRadius: 4,
                maxHeight: 500,
                overflow: 'auto',
                fontSize: 12,
              }}>
                {contractText}
              </pre>
            ),
          },
        ]}
      />

      <Divider />

      <Descriptions title="解析摘要" bordered size="small" column={3}>
        <Descriptions.Item label="合同编号">{editingRules.contract_id}</Descriptions.Item>
        <Descriptions.Item label="商户">{editingRules.merchant.name}</Descriptions.Item>
        <Descriptions.Item label="业态">
          <Tag color="blue">{editingRules.merchant.business_type}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="铺位">{editingRules.unit.unit_id}</Descriptions.Item>
        <Descriptions.Item label="面积">{editingRules.unit.area} ㎡</Descriptions.Item>
        <Descriptions.Item label="租金模式">
          <Tag color="purple">
            {RENT_TYPES.find((t) => t.value === editingRules.rent.type)?.label}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="租期">
          {editingRules.lease_period.start} ~ {editingRules.lease_period.end}
        </Descriptions.Item>
        <Descriptions.Item label="免租期">
          {editingRules.lease_period.free_rent?.rent_free
            ? `${editingRules.lease_period.free_rent.start} ~ ${editingRules.lease_period.free_rent.end}`
            : '无'}
        </Descriptions.Item>
        <Descriptions.Item label="置信度">
          <Tag color={isLowConfidence ? 'orange' : 'green'}>
            {(editingRules.confidence * 100).toFixed(0)}%
          </Tag>
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}