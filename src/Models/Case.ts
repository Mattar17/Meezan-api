export const CASE_STATUSES = [
  "قضية جديدة",
  "قيد المراجعة",
  "تم رفع الدعوى",
  "قيد النظر",
  "انتظار الجلسة",
  "تم تحديد جلسة",
  "قيد التحقيق",
  "انتظار الحكم",
  "تم الاستئناف",
  "تنفيذ الحكم",
  "موقوفة",
  "مغلقة",
  "كسبت",
  "خُسرت",
  "تمت التسوية",
  "رُفضت",
  "تم التنازل عنها",
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

export const PARTY_ROLES = ["مدعي", "مدعى عليه"] as const;

export type PartyRole = (typeof PARTY_ROLES)[number];

export const CASE_TYPES = [
  "مدني",
  "جنائي",
  "تجاري",
  "عمالي",
  "أحوال شخصية",
  "إداري",
  "تنفيذ",
  "تعويضات",
  "إيجارات",
  "اقتصادي",
  "ضرائب",
  "جمارك",
] as const;

export type CaseType = (typeof CASE_TYPES)[number];

export const CASE_DEGREES = ["أول درجة", "استئناف", "نقض", "التماس"] as const;

export type CaseDegree = (typeof CASE_DEGREES)[number];

export const CLIENT_TYPES = [
  "فرد",
  "شركة تضامن",
  "شركة توصية بسيطة",
  "شركة مساهمة",
  "شركة ذات مسؤولية محدودة",
  "شركة الشخص الواحد",
  "جهة حكومية",
  "أخرى",
] as const;

export type ClientType = (typeof CLIENT_TYPES)[number];

export interface Case {
  id: string;
  office_id: string;

  title: string;
  description?: string;

  case_number: string;
  case_year: string;

  client_name: string;
  client_opponent_name: string;

  client_role: PartyRole;

  client_national_id: string;
  client_opponent_national_id: string;

  case_type?: string;
  case_degree?: CaseDegree;
  client_type?: string;

  latest_court_session_date?: string;
  next_court_session_date?: string;

  court_name?: string;
  court_circuit?: string;

  case_status: CaseStatus;
  latest_update: string;

  assigned_lawyer_id?: string;

  opened_at: string;
  closed_at?: string;

  created_at: string;
  updated_at: string;
}
