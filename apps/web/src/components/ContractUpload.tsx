/**
 * Step 1: 合同上传
 * 支持：粘贴文本 / 上传 TXT 文件
 */
import { useState } from 'react';
import { Card, Tabs, Input, Button, Upload, Alert, Space, Typography } from 'antd';
import { InboxOutlined, SendOutlined } from '@ant-design/icons';

const { Dragger } = Upload;
const { TextArea } = Input;
const { Text } = Typography;

interface Props {
  onReady: (text: string) => void;
  loading: boolean;
}

const SAMPLE_CONTRACT = `购物中心租赁合同

合同编号：HT-2026-DEMO-001

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
乙方未按期支付费用的，每逾期一日按应付款项万分之五加收滞纳金，宽限期 10 天。`;

export function ContractUpload({ onReady, loading }: Props) {
  const [text, setText] = useState('');

  const handleFileRead = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content === 'string') {
        setText(content);
      }
    };
    reader.readAsText(file);
    return false; // 阻止默认上传
  };

  const draggerProps = {
    name: 'file',
    multiple: false,
    accept: '.txt,.md',
    beforeUpload: handleFileRead,
    showUploadList: false,
  };

  return (
    <Card title="📄 上传合同文本" extra={
      <Button type="link" onClick={() => setText(SAMPLE_CONTRACT)}>
        加载示例合同
      </Button>
    }>
      <Alert
        message="提示"
        description="支持粘贴合同文本，或上传 TXT/MD 文件。PDF/Word 需要先转换为文本（未来版本支持直接上传 PDF）。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Tabs
        items={[
          {
            key: 'paste',
            label: '粘贴文本',
            children: (
              <TextArea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="在此粘贴合同文本..."
                rows={12}
                style={{ fontFamily: 'monospace', fontSize: 13 }}
              />
            ),
          },
          {
            key: 'upload',
            label: '上传文件',
            children: (
              <Dragger {...draggerProps}>
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <p className="ant-upload-text">点击或拖拽 TXT/MD 文件到此区域</p>
                <p className="ant-upload-hint">
                  单文件不超过 10MB
                </p>
              </Dragger>
            ),
          },
        ]}
      />

      <Space style={{ marginTop: 16, width: '100%', justifyContent: 'space-between' }}>
        <Text type="secondary">
          字符数：{text.length}（最少 100 字符）
        </Text>
        <Button
          type="primary"
          icon={<SendOutlined />}
          loading={loading}
          disabled={text.length < 100}
          onClick={() => onReady(text)}
          size="large"
        >
          解析合同
        </Button>
      </Space>
    </Card>
  );
}