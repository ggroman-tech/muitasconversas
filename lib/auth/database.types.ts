// Tipos do Supabase usados pela frente A (escritos à mão a partir de
// 0001_schema_v1.sql, 0020_A_signup.sql e 0021_A_my_account.sql).
// Só descreve o que a frente A consome: a view my_account e as funções RPC.
// Se a equipe gerar tipos com `supabase gen types`, troque este arquivo.

export type SubscriptionStatus = "pending" | "active" | "past_due" | "paused" | "canceled";
export type LoanStatus = "scheduled" | "active" | "return_requested" | "returned" | "overdue" | "lost";
export type VisitStatus = "requested" | "confirmed" | "out_for_delivery" | "done" | "failed" | "canceled";
export type ReservationStatus = "queued" | "offered" | "fulfilled" | "expired" | "canceled";

export type MyAccountReservation = {
  reservation_id: string;
  book_id: string;
  title: string;
  authors: string[];
  status: "queued" | "offered";
  /** Posição na fila (1 = próximo). null quando o livro já foi oferecido. */
  position: number | null;
  queued_at: string;
  hold_expires_at: string | null;
};

export type MyAccountVisitItem = {
  direction: "deliver" | "collect";
  loan_id: string;
  title: string;
};

export type MyAccountHistoryItem = {
  loan_id: string;
  book_id: string;
  title: string;
  authors: string[];
  status: "returned" | "lost";
  delivered_at: string | null;
  returned_at: string | null;
};

export type MyAccountReminder = {
  kind: string;
  sent_at: string;
  subject: string | null;
};

export type MyAccountRow = {
  customer_id: string;
  full_name: string;
  email: string;
  whatsapp: string | null;
  subscription_id: string | null;
  subscription_status: SubscriptionStatus | null;
  started_at: string | null;
  current_period_end: string | null;
  paused_until: string | null;
  payment_method: string | null;
  plan_price_cents: number | null;
  address_id: string | null;
  cep: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  reference: string | null;
  area_name: string | null;
  loan_id: string | null;
  loan_status: LoanStatus | null;
  loan_book_id: string | null;
  loan_title: string | null;
  loan_authors: string[] | null;
  loan_delivered_at: string | null;
  loan_due_date: string | null;
  loan_days_left: number | null;
  /** Frente C: true quando há livro atrasado (bloqueia reservar/receber outro). */
  blocked_by_overdue: boolean;
  /** Frente C: data (date) em que o atraso começou; null se não bloqueado. */
  overdue_since: string | null;
  reservations: MyAccountReservation[];
  next_visit_id: string | null;
  next_visit_status: VisitStatus | null;
  next_visit_day: string | null;
  next_visit_starts_at: string | null;
  next_visit_ends_at: string | null;
  next_visit_items: MyAccountVisitItem[];
  history: MyAccountHistoryItem[];
  reminder_days_before: number[] | null;
  recent_reminders: MyAccountReminder[];
};

export type SignupConfig = {
  consent_version: string;
  plan_price_cents: number;
  max_open_loans: number;
  loan_days: number;
  renewal_allowed: boolean;
  late_fee_cents: number | null;
  hold_hours: number;
};

export type SignupCustomerArgs = {
  p_full_name: string;
  p_whatsapp: string;
  p_cep: string;
  p_street: string;
  p_number: string;
  p_complement: string;
  p_reference: string;
  p_consents: Record<string, boolean>;
  p_consent_version: string;
  p_source?: string;
};

export type SignupCustomerResult = {
  customer_id: string;
  address_id: string;
  area_id: number;
  subscription_id: string;
  status: "pending";
};

export type Database = {
  public: {
    Tables: { [_ in never]: never };
    Views: {
      my_account: { Row: MyAccountRow; Relationships: [] };
    };
    Functions: {
      check_service_area: {
        Args: { p_cep: string };
        Returns: { area_id: number; area_name: string }[];
      };
      signup_config: { Args: Record<string, never>; Returns: SignupConfig };
      signup_customer: { Args: SignupCustomerArgs; Returns: SignupCustomerResult };
      /** Frente C. Erros no DETAIL: cutoff_passed, etc. */
      /** Frente A, 0060_A_schedule_read.sql. Ver lib/schedule/types.ts. */
      schedule_options: { Args: Record<string, never>; Returns: unknown };
      /** Frente C. Erros no DETAIL: window_full, cutoff_passed, overdue_blocked, etc. */
      schedule_visit: {
        Args: { p_window_id: number; p_address_id: string; p_note?: string | null };
        Returns: unknown;
      };
      cancel_visit: { Args: { p_visit_id: string; p_reason?: string }; Returns: unknown };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
