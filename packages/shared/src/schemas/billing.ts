/**
 * 账单明细 Schema
 */
import { z } from 'zod';

export const BillDetailSchema = z.object({
  merchant_id: z.string(),
  period: z.string(),
  rent: z.number(),
  property_fee: z.number(),
  electricity: z.number(),
  water: z.number(),
  sewage: z.number(),
  other_fees: z.record(z.number()),
  total: z.number(),
  anomalies: z.array(z.object({
    type: z.string(),
    message: z.string(),
    severity: z.enum(['low', 'medium', 'high']),
  })),
  status: z.enum(['draft', 'reviewed', 'confirmed', 'sent', 'paid']),
  created_at: z.string(),
  updated_at: z.string(),
});

export type BillDetail = z.infer<typeof BillDetailSchema>;
