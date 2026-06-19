/**
 * 合同列表页
 * 展示所有已保存的合同，支持筛选、查看、删除
 */
import { useState, useEffect } from 'react';
import {
  Card, Table, Tag, Button, Space, Input, Select, message, Popconfirm, Typography, Statistic, Row, Col
} from 'antd';
import {
  PlusOutlined, EyeOutlined, DeleteOutlined, ReloadOutlined,
  FileTextOutlined
} from '@ant-design/icons';

interface Contract {
  id: string;
  contractId: string;
  merchantName: string;
  businessType: string;
  unitId: string;
  floor: string;
  area: string;
  leaseStart: string;
  leaseEnd: string;
  rentType: string;
  aiConfidence: string;
  needsReview: boolean;
  status: string;
  createdAt: string;
}

interface Props {
  onViewContract: (contractId: string) => void;
  onNewContract: () => void;
}

const RENT_TYPE_LABELS: Record<string, string> = {
  fixed: '固定租金',
  turnover: '扣率租金',
  take_higher: '两者取高',
  tiered: '阶梯扣率',
};

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  active: '生效中',
  archived: '已归档',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'default',
  active: 'green',
  archived: 'gray',
};

export function ContractList({ onViewContract, onNewContract }: Props) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [searchText, setSearchText] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  const fetchContracts = async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (filterStatus) params.set('status', filterStatus);
      if (searchText) params.set('unitId', searchText);

      const res = await fetch(`/api/contracts/list?${params}`);
      const data = await res.json();

      if (data.data) {
        setContracts(data.data);
        setPagination({ current: data.page, pageSize: data.pageSize, total: data.total });
      }
    } catch (e) {
      message.error('加载合同列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContracts();
  }, [filterStatus]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/contracts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        message.success('合同已删除');
        fetchContracts(pagination.current, pagination.pageSize);
      } else {
        message.error(`删除失败：${data.error}`);
      }
    } catch (e) {
      message.error('删除失败');
    }
  };

  const handleSearch = () => {
    fetchContracts(1, pagination.pageSize);
  };

  const columns = [
    {
      title: '合同编号',
      dataIndex: 'contractId',
      key: 'contractId',
      render: (v: string) => <Typography.Text strong>{v}</Typography.Text>,
    },
    {
      title: '商户',
      dataIndex: 'merchantName',
      key: 'merchantName',
    },
    {
      title: '铺位',
      key: 'unit',
      render: (_: unknown, r: Contract) => `${r.floor}-${r.unitId}`,
    },
    {
      title: '面积',
      dataIndex: 'area',
      key: 'area',
      render: (v: string) => `${v} ㎡`,
    },
    {
      title: '租金模式',
      dataIndex: 'rentType',
      key: 'rentType',
      render: (v: string) => <Tag color="purple">{RENT_TYPE_LABELS[v] ?? v}</Tag>,
    },
    {
      title: '租期',
      key: 'leasePeriod',
      render: (_: unknown, r: Contract) => `${r.leaseStart} ~ ${r.leaseEnd}`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] ?? v}</Tag>,
    },
    {
      title: '置信度',
      dataIndex: 'aiConfidence',
      key: 'aiConfidence',
      render: (v: string) => {
        const num = Number(v);
        return (
          <Tag color={num >= 0.8 ? 'green' : 'orange'}>
            {(num * 100).toFixed(0)}%
          </Tag>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, r: Contract) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => onViewContract(r.id)}
          >
            查看
          </Button>
          <Popconfirm
            title="确定删除此合同？"
            onConfirm={() => handleDelete(r.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic
              title="合同总数"
              value={pagination.total}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="生效中"
              value={contracts.filter(c => c.status === 'active').length}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="需审核"
              value={contracts.filter(c => c.needsReview).length}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="合同管理"
        extra={
          <Space>
            <Input
              placeholder="搜索铺位编号"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 200 }}
              allowClear
            />
            <Select
              placeholder="状态筛选"
              value={filterStatus}
              onChange={setFilterStatus}
              style={{ width: 120 }}
              allowClear
              options={[
                { value: 'draft', label: '草稿' },
                { value: 'active', label: '生效中' },
                { value: 'archived', label: '已归档' },
              ]}
            />
            <Button icon={<ReloadOutlined />} onClick={() => fetchContracts(pagination.current)}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={onNewContract}>
              新建合同
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={contracts}
          loading={loading}
          rowKey="id"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => fetchContracts(page, pageSize),
          }}
          locale={{ emptyText: '暂无合同，点击右上角"新建合同"开始' }}
        />
      </Card>
    </div>
  );
}
