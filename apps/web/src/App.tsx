import { useState } from 'react';
import { ConfigProvider, Layout, Typography, Steps, Card, Space, message } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { ContractUpload } from './components/ContractUpload';
import { ParseResultViewer } from './components/ParseResultViewer';
import { FeePreview } from './components/FeePreview';
import type { ContractFeeRules } from '@mall/shared';

const { Header, Content, Footer } = Layout;
const { Title } = Typography;

export default function App() {
  const [currentStep, setCurrentStep] = useState(0);
  const [contractText, setContractText] = useState('');
  const [parseResult, setParseResult] = useState<ContractFeeRules | null>(null);
  const [editingRules, setEditingRules] = useState<ContractFeeRules | null>(null);
  const [loading, setLoading] = useState(false);

  // Step 1: 处理合同文本
  const handleContractReady = async (text: string) => {
    setContractText(text);
    setLoading(true);
    try {
      const res = await fetch('/api/contracts/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract_text: text, model: 'deepseek' }),
      });
      const data = await res.json();
      if (data.success) {
        setParseResult(data.data);
        setEditingRules(data.data);
        setCurrentStep(1);
        if (data.needs_review) {
          message.warning(`置信度 ${data.data.confidence} < 0.8，建议人工审核`);
        } else {
          message.success('合同解析成功');
        }
      } else {
        message.error(`解析失败：${data.error}`);
      }
    } catch (e) {
      message.error(`请求失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: 确认编辑后的规则
  const handleConfirmEdit = (rules: ContractFeeRules) => {
    setEditingRules(rules);
    setCurrentStep(2);
    message.success('规则已确认，进入费用预览');
  };

  // Step 3: 返回重新编辑
  const handleBackToEdit = () => {
    setCurrentStep(1);
  };

  return (
    <ConfigProvider locale={zhCN}>
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{ display: 'flex', alignItems: 'center', background: '#001529' }}>
          <Title level={3} style={{ color: '#fff', margin: 0 }}>
            🏬 购物中心费用核算 Agent
          </Title>
        </Header>
        <Content style={{ padding: '24px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
          <Card>
            <Steps
              current={currentStep}
              items={[
                { title: '上传合同', description: 'PDF/Word/TXT' },
                { title: '解析 + 编辑', description: 'AI 提取 + 人工校对' },
                { title: '费用预览', description: '查看本月账单' },
              ]}
              style={{ marginBottom: 24 }}
            />

            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              {currentStep === 0 && (
                <ContractUpload onReady={handleContractReady} loading={loading} />
              )}
              {currentStep === 1 && parseResult && editingRules && (
                <ParseResultViewer
                  originalRules={parseResult}
                  editingRules={editingRules}
                  contractText={contractText}
                  onChange={setEditingRules}
                  onConfirm={() => handleConfirmEdit(editingRules)}
                  onBack={() => setCurrentStep(0)}
                />
              )}
              {currentStep === 2 && editingRules && (
                <FeePreview rules={editingRules} onBack={handleBackToEdit} />
              )}
            </Space>
          </Card>
        </Content>
        <Footer style={{ textAlign: 'center' }}>
          Mall Fee Agent ©2026 — Phase 1 MVP
        </Footer>
      </Layout>
    </ConfigProvider>
  );
}