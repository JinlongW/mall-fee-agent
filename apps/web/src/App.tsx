import { ConfigProvider, Layout, Typography } from 'antd';
import zhCN from 'antd/locale/zh_CN';

const { Header, Content, Footer } = Layout;
const { Title } = Typography;

export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{ display: 'flex', alignItems: 'center' }}>
          <Title level={3} style={{ color: '#fff', margin: 0 }}>
            🏬 购物中心费用核算 Agent
          </Title>
        </Header>
        <Content style={{ padding: '24px' }}>
          <Title level={2}>功能模块</Title>
          <ul>
            <li>📄 合同解析 — 上传合同 PDF，AI 提取费用规则</li>
            <li>🧮 费用核算 — 按规则自动计算每户月度费用</li>
            <li>📋 账单生成 — 生成 PDF 账单并推送</li>
            <li>💰 对账催缴 — 应收 vs 实收核对，智能催缴</li>
            <li>🔍 查询问答 — 自然语言查询费用明细</li>
          </ul>
        </Content>
        <Footer style={{ textAlign: 'center' }}>
          Mall Fee Agent ©2026
        </Footer>
      </Layout>
    </ConfigProvider>
  );
}
