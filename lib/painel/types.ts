export type StaffRole = "admin" | "ops" | "driver";

export type RouteItem = {
  direction: "deliver" | "collect";
  loan_id: string;
  copy_label: string;
  title: string;
};

export type RouteRow = {
  visit_id: string;
  delivery_day: string;
  window_starts_at: string;
  window_ends_at: string;
  area_name: string;
  route_order: number | null;
  visit_status: "requested" | "confirmed" | "out_for_delivery" | "done";
  customer_name: string;
  customer_whatsapp: string | null;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  reference: string | null;
  customer_note: string | null;
  items: RouteItem[];
};

export type RouteLoan = { visit_id: string; loan_id: string; direction: "deliver" | "collect"; loan_status: string };

export type OverdueRow = {
  loan_id: string;
  customer_name: string;
  customer_email: string;
  customer_whatsapp: string | null;
  book_title: string;
  label_code: string;
  due_date: string;
  days_overdue: number;
};

export type SaturdayRow = {
  delivery_day_id: number;
  day: string;
  cutoff_at: string;
  cutoff_passed: boolean;
  status: string;
  windows_count: number;
  visits_count: number;
};

export type WaitingRow = {
  reservation_id: string;
  reservation_status: "queued" | "offered";
  queued_at: string;
  hold_expires_at: string | null;
  book_title: string;
  customer_name: string;
  customer_email: string;
  customer_whatsapp: string | null;
  queue_position: number | null;
};

export type ActionState = { status: "idle" | "ok" | "error"; message?: string };
