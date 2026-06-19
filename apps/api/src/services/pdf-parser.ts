/**
 * PDF 解析服务
 * 使用 unpdf 提取 PDF 文本，支持本地 + 远程 PDF
 */
import { extractText, getDocumentProxy } from 'unpdf';

export interface PdfExtractionResult {
  text: string;
  pages: number;
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
  };
}

/**
 * 从 Buffer 提取 PDF 文本
 */
export async function extractPdfFromBuffer(buffer: Uint8Array | Buffer): Promise<PdfExtractionResult> {
  const data = buffer instanceof Buffer ? new Uint8Array(buffer) : buffer;

  // 提取所有页面的文本
  const result = await extractText(data, { mergePages: true });

  return {
    text: Array.isArray(result.text) ? result.text.join('\n') : result.text,
    pages: result.totalPages,
  };
}

/**
 * 从 base64 字符串提取 PDF 文本
 */
export async function extractPdfFromBase64(base64: string): Promise<PdfExtractionResult> {
  // 去除 data:application/pdf;base64, 前缀
  const cleanBase64 = base64.replace(/^data:application\/pdf;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  return extractPdfFromBuffer(buffer);
}

/**
 * 从 URL 提取 PDF 文本
 */
export async function extractPdfFromUrl(url: string): Promise<PdfExtractionResult> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载 PDF 失败：${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return extractPdfFromBuffer(new Uint8Array(arrayBuffer));
}

/**
 * 验证 PDF 文件（检查 magic number）
 */
export function isPdfFile(buffer: Uint8Array | Buffer): boolean {
  const data = buffer instanceof Buffer ? new Uint8Array(buffer) : buffer;
  // PDF 文件以 %PDF- 开头
  return data.length >= 5
    && data[0] === 0x25  // %
    && data[1] === 0x50  // P
    && data[2] === 0x44  // D
    && data[3] === 0x46  // F
    && data[4] === 0x2D; // -
}

/**
 * 提取 PDF 元数据（标题、作者等）
 */
export async function getPdfMetadata(buffer: Uint8Array | Buffer): Promise<PdfExtractionResult['metadata']> {
  const data = buffer instanceof Buffer ? new Uint8Array(buffer) : buffer;
  const pdf = await getDocumentProxy(data);
  const meta = await pdf.getMetadata();
  const info = meta.info as Record<string, string> | undefined;
  return {
    title: info?.Title,
    author: info?.Author,
    subject: info?.Subject,
    keywords: info?.Keywords,
  };
}