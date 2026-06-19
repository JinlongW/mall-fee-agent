-- 初始化数据库表结构
-- 执行：pnpm tsx tools/migrate.ts

-- 合同表
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  business_type TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  floor TEXT NOT NULL,
  area NUMERIC(10, 2) NOT NULL,
  lease_start TEXT NOT NULL,
  lease_end TEXT NOT NULL,
  free_rent_start TEXT,
  free_rent_end TEXT,
  rent_type TEXT NOT NULL,
  rent_rules JSONB NOT NULL,
  property_fee_rules JSONB,
  utility_rules JSONB,
  other_fee_rules JSONB,
  late_fee_rules JSONB,
  raw_contract_text TEXT,
  source_pdf TEXT,
  source_pages INTEGER,
  ai_confidence NUMERIC(3, 2),
  needs_review BOOLEAN DEFAULT FALSE,
  reviewed_by TEXT,
  reviewed_at TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT[],
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 账单表
CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id TEXT NOT NULL,
  period TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  sales NUMERIC(12, 2),
  electricity_usage NUMERIC(10, 2),
  water_usage NUMERIC(10, 2),
  total_amount NUMERIC(12, 2) NOT NULL,
  anomalies JSONB,
  status TEXT NOT NULL DEFAULT 'draft',
  pdf_url TEXT,
  paid_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 账单明细表
CREATE TABLE IF NOT EXISTS bill_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL,
  item_key TEXT NOT NULL,
  item_name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  formula TEXT,
  unit_price NUMERIC(10, 4),
  quantity NUMERIC(10, 2),
  remarks TEXT
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_contracts_contract_id ON contracts(contract_id);
CREATE INDEX IF NOT EXISTS idx_contracts_unit_id ON contracts(unit_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_lease_period ON contracts(lease_start, lease_end);

CREATE INDEX IF NOT EXISTS idx_bills_contract_period ON bills(contract_id, period);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_period ON bills(period);

CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_item_key ON bill_items(item_key);
