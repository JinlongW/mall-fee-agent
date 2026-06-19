# 购物中心合同解析 Agent 开发与 Prompt 调优指南

> 从 PDF 到结构化费用规则的完整技术路径 | 2026-06-19

---

## 一、合同解析的整体流程

```
Step 1: 文档预处理
├── PDF/Word → 文本提取（PyMuPDF / python-docx）
├── OCR 处理扫描件（PaddleOCR）
├── 表格识别 + 清洗页眉页脚

Step 2: 分段与定位
├── 按条款分段（识别"第X条"、"附件"）
├── 定位关键段落：租金、费用、期限

Step 3: LLM 结构化提取（核心！）
├── 对每个关键段落调用 LLM
├── 使用 JSON Schema 约束输出格式
├── Few-shot 示例引导提取逻辑
└── 输出：费用规则 JSON

Step 4: 验证与修复
├── JSON Schema 校验 + 业务规则校验
├── 缺失字段检测 + 二次提取
└── 置信度评分（低于 0.8 → 人工审核）

Step 5: 人工确认
├── 展示提取结果 + 原文对照
└── 修正结果反馈到 Few-shot 库（持续改进）
```

---

## 二、文档预处理

### 典型购物中心租赁合同结构

```
├── 第一条 租赁标的（铺位编号、面积）
├── 第二条 租赁期限（起止日期、免租期）
├── 第三条 租金及支付方式 ★ 核心
├── 第四条 物业管理费 ★
├── 第五条 水电费 ★
├── 第六条 推广费/广告费
├── 第七条 保证金
├── 附件二：费用明细表 ★ 可能有
└── 签章页
```

### 预处理代码

```python
import fitz, re

def preprocess_contract(pdf_path: str) -> dict:
    doc = fitz.open(pdf_path)
    full_text = ""
    for page in doc:
        text = page.get_text()
        text = re.sub(r'第\s*\d+\s*页\s*共\s*\d+\s*页', '', text)
        full_text += text + "\n"

    # 按条款分段
    sections = {}
    current_section = "header"
    current_text = []
    for line in full_text.split('\n'):
        match = re.match(r'第([一二三四五六七八九十]+)条\s+(.+)', line)
        if match:
            sections[current_section] = '\n'.join(current_text)
            current_section = match.group(2)
            current_text = [line]
        else:
            current_text.append(line)
    sections[current_section] = '\n'.join(current_text)
    return {"full_text": full_text, "sections": sections}
```

---

## 三、LLM 结构化提取（核心）

### 3.1 技术方案

| 方案 | 适用 | 推荐 |
|------|------|------|
| **Claude JSON Schema** | 生产环境，100% 格式保证 | ⭐⭐⭐⭐⭐ |
| **Few-shot Prompt** | 快速原型 | ⭐⭐⭐ |
| **分步提取 + 自校验** | 高准确率场景 | ⭐⭐⭐⭐⭐ |

### 3.2 核心 Prompt（V1 基础版）

```
你是购物中心租赁合同费用规则提取专家。

## 需要提取的信息：
- 基本信息：合同编号、商户名称、业态
- 铺位信息：编号、楼层、面积
- 租赁期限：起止日期、免租期（起止、是否免物业费、方式）
- 租金规则：模式（固定/扣率/两者取高/阶梯）、单价、递增规则
- 物业费：单价、是否含空调、公摊比例
- 水电费：电价类型/阶梯/分时、水价、污水处理费
- 其他费用：推广费、POS费、垃圾费等
- 滞纳金：费率、宽限天数

## 输出要求：
1. 严格 JSON 格式
2. 没有明确写明的填 null
3. 数值类型不加引号
4. 日期格式 YYYY-MM-DD

## 注意事项：
- "两者取高" = 每月比较固定租金和扣率租金，取高者
- 递增基准"按签约价" → base: "contract_start"
- 递增基准"按上期" → base: "previous"
- 免租方式 "direct"=直接减免，"spread"=均摊，"refund"=先交后返
```

### 3.3 Claude API 调用

```python
import anthropic, json

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=4096,
    messages=[{"role": "user", "content": prompt}],
    output_config={
        "format": {
            "type": "json_schema",
            "schema": CONTRACT_SCHEMA  # 定义完整的 JSON Schema
        }
    }
)
result = json.loads(response.content[0].text)
```

---

## 四、Prompt 调优：从 70% 到 95%

### 调优路线图

```
V1 基础 Prompt → ~70%
├── 问题：模糊条款理解错误、数字遗漏
└── → 加 Few-shot + 边界规则

V2 Few-shot + 边界规则 → ~85%
├── 问题：复杂混合模式不准
└── → 分步提取 + 多模型

V3 分步提取 + 自校验 → ~95%
└── → 持续学习（人工修正反馈到 Few-shot 库）
```

### V2 关键优化：Few-shot 示例

```
### 示例 1：两者取高合同

合同原文：
"第三条 租金
铺位B1-023，面积120.5平方米。
租金采用固定租金与营业额扣率两者取高：
（一）固定租金：每月每平方米150元，即月固定租金18,075元。
自第二年起每年递增5%，递增基数为签约时单价。
（二）扣率：按当月营业额的12%计算。
（三）两者取高。
（四）保底租金18,075元，随固定租金同步递增。
免租期3个月，免租期内免收租金，物业费正常收取。"

正确提取：
{
  "unit": {"unit_id": "B1-023", "area": 120.5},
  "rent": {
    "type": "take_higher",
    "fixed": {"base_price": 150, "escalation": {"frequency": "yearly", "rate": 0.05, "base": "contract_start"}},
    "turnover": {"rate": 0.12, "minimum": 18075, "minimum_escalates": true}
  },
  "free_rent": {"rent_free": true, "property_fee_free": false, "method": "direct"}
}
```

### V3 关键优化：分步提取 + 自校验

```python
def parse_contract_v3(key_sections):
    # Step 1: 基本信息
    basic = extract(BASIC_PROMPT, sections["租赁标的"] + sections["租赁期限"])
    # Step 2: 租金规则（用最强模型）
    rent = extract(RENT_PROMPT, sections["租金"], model="claude-opus-4-8")
    # Step 3: 其他费用
    other = extract(FEES_PROMPT, sections["物业费"] + sections["水电费"])
    # 合并
    result = {**basic, **rent, **other}
    # Step 4: 自校验
    validation = self_validate(result, key_sections)
    result["confidence"] = validation["confidence"]
    return result
```

### 持续改进闭环

```
AI 解析 → 人工审核 → 发现错误 → 记录错误案例
→ 加入 Few-shot 库 → 更新边界规则 → 重新测试
→ 目标：每个错误类型只犯一次
```

---

## 五、常见错误与对策

| 错误类型 | 频率 | 对策 |
|---------|------|------|
| 递增基准判断错误 | 高 | 加明确规则 + Few-shot |
| 免租期物业费遗漏 | 高 | 加边界规则说明 |
| 保底递增关系遗漏 | 中 | 专项检查"保底是否递增" |
| 阶梯断点理解错误 | 中 | 加阶梯计算示例 |
| 附件费用遗漏 | 中 | 单独提取附件段落 |
| 手写修改未识别 | 低 | OCR + 人工标记 |

---

## 六、开发路线图

```
第一天：跑通最小 Demo
├── 读一份 PDF → 调 Claude → 输出 JSON
└── 人工对比验证

第一周：建立测试集
├── 10 份不同类型合同 + 手动提取的"标准答案"
└── 自动化测试脚本

第一月：达到 85% 准确率
├── Few-shot 库 10+ 示例
├── 边界规则 20 条
└── 自校验流程

第一季：达到 95% 准确率
├── 测试集 30 份
├── Few-shot 库 20+
├── 边界规则 50+
└── 种子用户真实验证
```

---

## 七、关键决策

```
Q: 用什么模型？
A: 合同解析用 Claude Sonnet（性价比）或 Opus（最准）。
   简单查询用 DeepSeek（便宜）。成本可忽略（~¥0.5/份）。

Q: 一份合同调几次 LLM？
A: V1 = 1次（¥0.1），V3 = 3-4次（¥0.5）。
   300商户×12月 = 3600份/年 ≈ ¥360-1800/年。

Q: 置信度低于多少需要人工审核？
A: < 0.8 必须审核，0.8-0.95 抽查，> 0.95 自动通过。

Q: 扫描件怎么办？
A: PaddleOCR 识别 → 再走 LLM。手写合同建议人工录入。
```

---

## 参考来源

| 来源 | 关键信息 |
|------|----------|
| Claude Structured Outputs API | JSON Schema 约束，100% 格式正确 |
| Prompt Engineering Best Practices | 明确输出契约、Few-shot、分步提取 |
| AWS 结构化信息提取 | 预处理→提取→验证→迭代闭环 |
| Maxim AI Prompt 指南 | 准确率/推理/成本/可控性四维评估 |
| CN118940732A 专利 | 多模型集成 + 投票器提升准确率 |
