export type ScheduleAddress = {
  id: string;
  street: string;
  number: string;
  complement: string | null;
  cep: string;
  area_id: number;
  area_name: string;
  is_default: boolean;
};

export type ScheduleWindow = {
  window_id: number;
  area_id: number;
  area_name: string;
  starts_at: string;
  ends_at: string;
  full: boolean;
};

export type ScheduleDay = {
  day: string; // YYYY-MM-DD
  cutoff_at: string;
  already_scheduled: boolean;
  windows: ScheduleWindow[];
};

/** Retorno de schedule_options() (migração 0060_A). */
export type ScheduleOptions = {
  has_active_subscription: boolean;
  blocked_by_overdue: boolean;
  overdue_since: string | null;
  deliver: { title: string; hold_expires_at: string } | null;
  offer_held_back: boolean;
  collect: { loan_id: string; title: string; due_date: string | null; status: string }[];
  addresses: ScheduleAddress[];
  days: ScheduleDay[];
};
