/**
 * 账单 PDF 模板
 * 使用 @react-pdf/renderer 生成 PDF
 */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';
import type { ContractFeeRules } from '@mall/shared';
import type { CalcOutput } from '@mall/fee-engine';
import { getCalculationDetails } from '@mall/shared';

// 注册中文字体（使用内置 Helvetica 作为 fallback，实际项目需加载 Noto Sans CJK）
Font.register({
  family: 'Helvetica',
  src: 'Helvetica',
});

// 样式定义
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
  },
  header: {
    marginBottom: 20,
    borderBottom: 2,
    borderBottomColor: '#1a73e8',
    borderBottomWidth: 1,
    paddingBottom: 15,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a73e8',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    borderBottom: 1,
    borderBottomColor: '#ccc',
    borderBottomWidth: 1,
    paddingBottom: 5,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  infoLabel: {
    width: 100,
    color: '#666',
    fontSize: 9,
  },
  infoValue: {
    flex: 1,
    color: '#333',
    fontSize: 9,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    fontWeight: 'bold',
    fontSize: 9,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
    fontSize: 9,
  },
  tableCol: {
    flex: 1,
  },
  tableColAmount: {
    width: 100,
    textAlign: 'right',
  },
  totalRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#f5f5f5',
    borderTopWidth: 2,
    borderTopColor: '#1a73e8',
    fontWeight: 'bold',
    fontSize: 11,
  },
  footer: {
    marginTop: 30,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#ccc',
    fontSize: 8,
    color: '#999',
  },
  notesSection: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderLeftWidth: 3,
    borderLeftColor: '#ffa000',
  },
  noteText: {
    fontSize: 8,
    color: '#666',
    marginBottom: 3,
  },
});

interface BillPdfProps {
  contractId: string;
  merchantName: string;
  period: string;
  rules: ContractFeeRules;
  bill: CalcOutput;
}

/**
 * 生成账单 PDF 文档
 */
export function BillDocument({
  contractId,
  merchantName,
  period,
  rules,
  bill,
}: BillPdfProps) {
  const details = getCalculationDetails(rules, 200000, 2000, 30);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* 头部 */}
        <View style={styles.header}>
          <Text style={styles.title}>购物中心费用账单</Text>
          <Text style={styles.subtitle}>合同编号：{contractId}</Text>
          <Text style={styles.subtitle}>商户：{merchantName}</Text>
          <Text style={styles.subtitle}>账期：{period}</Text>
        </View>

        {/* 基本信息 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 基本信息</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>铺位编号：</Text>
            <Text style={styles.infoValue}>{rules.unit.unit_id}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>铺位面积：</Text>
            <Text style={styles.infoValue}>{rules.unit.area} ㎡</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>租金模式：</Text>
            <Text style={styles.infoValue}>
              {rules.rent.type === 'take_higher'
                ? '两者取高'
                : rules.rent.type === 'fixed'
                ? '固定租金'
                : rules.rent.type === 'turnover'
                ? '扣率租金'
                : '阶梯扣率'}
            </Text>
          </View>
        </View>

        {/* 费用明细 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💰 费用明细</Text>
          <View style={styles.tableHeader}>
            <Text style={styles.tableCol}>费用项目</Text>
            <Text style={styles.tableColAmount}>金额 (元)</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCol}>租金</Text>
            <Text style={styles.tableColAmount}>{bill.rent.toFixed(2)}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCol}>物业费</Text>
            <Text style={styles.tableColAmount}>{bill.property_fee.toFixed(2)}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCol}>电费</Text>
            <Text style={styles.tableColAmount}>{bill.electricity.toFixed(2)}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCol}>水费</Text>
            <Text style={styles.tableColAmount}>{bill.water.toFixed(2)}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCol}>污水处理费</Text>
            <Text style={styles.tableColAmount}>{bill.sewage.toFixed(2)}</Text>
          </View>
          {Object.entries(bill.other_fees).map(([key, value]: [string, number]) => (
            <View style={styles.tableRow} key={key}>
              <Text style={styles.tableCol}>{key}</Text>
              <Text style={styles.tableColAmount}>{value.toFixed(2)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.tableCol}>应付总额</Text>
            <Text style={styles.tableColAmount}>{bill.total.toFixed(2)}</Text>
          </View>
        </View>

        {/* 计算说明 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🧮 计算说明</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>租金：</Text>
            <Text style={styles.infoValue}>{details.rent}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>物业费：</Text>
            <Text style={styles.infoValue}>{details.property_fee}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>电费：</Text>
            <Text style={styles.infoValue}>{details.electricity}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>水费：</Text>
            <Text style={styles.infoValue}>{details.water}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>污水处理：</Text>
            <Text style={styles.infoValue}>{details.sewage}</Text>
          </View>
        </View>

        {/* 备注 */}
        {bill.anomalies.length > 0 && (
          <View style={styles.notesSection}>
            <Text style={{ fontWeight: 'bold', fontSize: 9, marginBottom: 5, color: '#ffa000' }}>
              ️ 异常提醒
            </Text>
            {bill.anomalies.map((a: { message: string }, i: number) => (
              <Text key={i} style={styles.noteText}>
                - {a.message}
              </Text>
            ))}
          </View>
        )}

        {/* 页脚 */}
        <View style={styles.footer}>
          <Text>本账单由 AI Agent 自动生成，如有疑问请联系物业管理部门。</Text>
          <Text>生成时间：{new Date().toLocaleString('zh-CN')}</Text>
        </View>
      </Page>
    </Document>
  );
}
