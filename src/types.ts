export interface RecordData {
  id: string;
  user_id: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  note: string;
  payment_method: 'cash' | 'credit_card';
  created_at: string;
  is_urgent?: boolean;
  version?: number;
  updated_at?: string;
  deleted_at?: string | null;
  kind?: 'ordinary' | 'repayment' | 'adjustment';
  adjustment_reason?: string | null;
  adjustment_at?: string | null;
  original_record_id?: string | null;
}

export interface FinancialSettings {
  openingCash: number | null;
  openingLiability: number | null;
  creditLimit: number | null;
  openingAt: string | null;
}
export const defaultSettings: FinancialSettings = { openingCash: null, openingLiability: null, creditLimit: null, openingAt: null };

export interface User {
  id: string;
  name: string;
  email?: string;
  picture?: string;
}
