/**
 * 合同相关 API 路由
 *
 * 端点：
 *   POST /parse              - 直接传文本解析（已有）
 *   POST /upload             - 上传 PDF/Word/TXT 文件 → 提取文本 → 解析
 *   GET  /health             - 健康检查
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { parseContract } from '../agents/contract-parser.js';
import { extractPdfFromBuffer, extractPdfFromBase64, isPdfFile } from '../services/pdf-parser.js';

const app = new Hono();

// =============================================================
// 路由 1: 直接传文本解析
// =============================================================

app.post('/parse', zValidator('json', z.object({
  contract_text: z.string().min(100, '合同文本过短'),
  model: z.enum(['claude', 'deepseek', 'mock']).optional(),
})), async (c) => {
  const { contract_text, model } = c.req.valid('json');

  try {
    const rules = await parseContract(contract_text, { model });

    return c.json({
      success: true,
      data: rules,
      needs_review: rules.confidence < 0.8,
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : '解析失败',
    }, 500);
  }
});

// =============================================================
// 路由 2: 上传 PDF 文件 → 自动提取文本 → 解析
// =============================================================

app.post('/upload', async (c) => {
  try {
    const contentType = c.req.header('content-type') ?? '';

    let pdfBuffer: Uint8Array;

    if (contentType.includes('multipart/form-data')) {
      // multipart 上传（暂不支持，使用 base64 方式）
      return c.json({
        success: false,
        error: '请使用 base64 方式上传（POST /upload-json）',
      }, 400);
    }

    if (contentType.includes('application/json')) {
      // JSON 方式：接收 base64
      const body = await c.req.json();
      const { file_base64, model } = body;

      if (!file_base64 || typeof file_base64 !== 'string') {
        return c.json({ success: false, error: '缺少 file_base64 字段' }, 400);
      }

      pdfBuffer = Buffer.from(file_base64.replace(/^data:application\/pdf;base64,/, ''), 'base64');
    } else if (contentType.includes('application/pdf')) {
      // 直接上传 PDF
      pdfBuffer = new Uint8Array(await c.req.arrayBuffer());
    } else {
      return c.json({
        success: false,
        error: `不支持的 Content-Type: ${contentType}`,
      }, 400);
    }

    // 验证 PDF 文件
    if (!isPdfFile(pdfBuffer)) {
      return c.json({
        success: false,
        error: '文件不是有效的 PDF',
      }, 400);
    }

    // 提取文本
    const extraction = await extractPdfFromBuffer(pdfBuffer);
    const text = extraction.text.trim();

    if (text.length < 100) {
      return c.json({
        success: false,
        error: `PDF 文本提取失败或内容过短（${text.length} 字符）`,
        pages: extraction.pages,
      }, 400);
    }

    // 解析合同（自动选模型）
    const rules = await parseContract(text);

    return c.json({
      success: true,
      data: {
        ...rules,
        // 保留原始 PDF 元数据
        notes: [
          ...(rules.notes ?? []),
          `来源: PDF (${extraction.pages} 页, ${text.length} 字符)`,
        ],
      },
      needs_review: rules.confidence < 0.8,
      pages: extraction.pages,
      text_length: text.length,
    });
  } catch (error) {
    console.error('PDF upload error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : '上传解析失败',
    }, 500);
  }
});

// =============================================================
// 路由 3: 上传 PDF (base64) — 简化版
// =============================================================

const UploadSchema = z.object({
  file_base64: z.string().min(100, 'PDF 内容过短'),
  model: z.enum(['claude', 'deepseek', 'mock']).optional(),
});

app.post('/upload-pdf', zValidator('json', UploadSchema), async (c) => {
  const { file_base64, model } = c.req.valid('json');

  try {
    const extraction = await extractPdfFromBase64(file_base64);
    const text = extraction.text.trim();

    if (text.length < 100) {
      return c.json({
        success: false,
        error: `PDF 文本提取失败或内容过短（${text.length} 字符）`,
        pages: extraction.pages,
      }, 400);
    }

    const rules = await parseContract(text, { model });

    return c.json({
      success: true,
      data: rules,
      needs_review: rules.confidence < 0.8,
      pages: extraction.pages,
      text_length: text.length,
    });
  } catch (error) {
    console.error('PDF upload error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : '解析失败',
    }, 500);
  }
});

// =============================================================
// 健康检查
// =============================================================

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;