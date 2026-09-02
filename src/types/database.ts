export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      analytics: {
        Row: {
          key: string
          number_of_downloads: number | null
        }
        Insert: {
          key: string
          number_of_downloads?: number | null
        }
        Update: {
          key?: string
          number_of_downloads?: number | null
        }
        Relationships: []
      }
      books: {
        Row: {
          category_id: string
          created_at: string
          description: string | null
          file_ext: string
          file_size_bytes: number | null
          id: string
          is_subscription_only: boolean
          storage_path: string
          title: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          file_ext: string
          file_size_bytes?: number | null
          id?: string
          is_subscription_only?: boolean
          storage_path: string
          title: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          file_ext?: string
          file_size_bytes?: number | null
          id?: string
          is_subscription_only?: boolean
          storage_path?: string
          title?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "books_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "books_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "lawyers"
            referencedColumns: ["id"]
          },
        ]
      }
      case_assignments: {
        Row: {
          assigned_at: string
          case_id: string
          id: string
          lawyer_id: string
        }
        Insert: {
          assigned_at?: string
          case_id: string
          id?: string
          lawyer_id: string
        }
        Update: {
          assigned_at?: string
          case_id?: string
          id?: string
          lawyer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_assignments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_assignments_lawyer_id_fkey"
            columns: ["lawyer_id"]
            isOneToOne: false
            referencedRelation: "lawyers"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          assigned_lawyer_id: string | null
          case_degree: Database["public"]["Enums"]["case_degree_enum"] | null
          case_number: string
          case_status: Database["public"]["Enums"]["case_status_enum"] | null
          case_type: Database["public"]["Enums"]["case_type_enum"] | null
          case_year: string
          client_name: string
          client_national_id: string
          client_opponent_name: string
          client_opponent_national_id: string
          client_role: string
          client_type: Database["public"]["Enums"]["client_type_enum"] | null
          closed_at: string | null
          court_circuit: string | null
          court_name: string | null
          created_at: string
          description: string | null
          id: string
          latest_court_session_date: string | null
          latest_update: string | null
          next_court_session_date: string | null
          office_id: string
          opened_at: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_lawyer_id?: string | null
          case_degree?: Database["public"]["Enums"]["case_degree_enum"] | null
          case_number: string
          case_status?: Database["public"]["Enums"]["case_status_enum"] | null
          case_type?: Database["public"]["Enums"]["case_type_enum"] | null
          case_year: string
          client_name: string
          client_national_id: string
          client_opponent_name: string
          client_opponent_national_id: string
          client_role: string
          client_type?: Database["public"]["Enums"]["client_type_enum"] | null
          closed_at?: string | null
          court_circuit?: string | null
          court_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          latest_court_session_date?: string | null
          latest_update?: string | null
          next_court_session_date?: string | null
          office_id: string
          opened_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_lawyer_id?: string | null
          case_degree?: Database["public"]["Enums"]["case_degree_enum"] | null
          case_number?: string
          case_status?: Database["public"]["Enums"]["case_status_enum"] | null
          case_type?: Database["public"]["Enums"]["case_type_enum"] | null
          case_year?: string
          client_name?: string
          client_national_id?: string
          client_opponent_name?: string
          client_opponent_national_id?: string
          client_role?: string
          client_type?: Database["public"]["Enums"]["client_type_enum"] | null
          closed_at?: string | null
          court_circuit?: string | null
          court_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          latest_court_session_date?: string | null
          latest_update?: string | null
          next_court_session_date?: string | null
          office_id?: string
          opened_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_assigned_lawyer_id_fkey"
            columns: ["assigned_lawyer_id"]
            isOneToOne: false
            referencedRelation: "lawyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          client_state: Database["public"]["Enums"]["client_status"]
          client_type: string | null
          created_at: string | null
          file_number: string | null
          file_opening_date: string | null
          governorate:
            | Database["public"]["Enums"]["egyptian_governorate"]
            | null
          id: string
          job: string | null
          name: string
          national_id: string | null
          notes: string | null
          office_id: string | null
          phone_number: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          client_state?: Database["public"]["Enums"]["client_status"]
          client_type?: string | null
          created_at?: string | null
          file_number?: string | null
          file_opening_date?: string | null
          governorate?:
            | Database["public"]["Enums"]["egyptian_governorate"]
            | null
          id: string
          job?: string | null
          name: string
          national_id?: string | null
          notes?: string | null
          office_id?: string | null
          phone_number?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          client_state?: Database["public"]["Enums"]["client_status"]
          client_type?: string | null
          created_at?: string | null
          file_number?: string | null
          file_opening_date?: string | null
          governorate?:
            | Database["public"]["Enums"]["egyptian_governorate"]
            | null
          id?: string
          job?: string | null
          name?: string
          national_id?: string | null
          notes?: string | null
          office_id?: string | null
          phone_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_client_office"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_lawyer_id: string | null
          office_id: string
          responded_at: string | null
          role: string
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_lawyer_id?: string | null
          office_id: string
          responded_at?: string | null
          role?: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_lawyer_id?: string | null
          office_id?: string
          responded_at?: string | null
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_invited_lawyer_id_fkey"
            columns: ["invited_lawyer_id"]
            isOneToOne: false
            referencedRelation: "lawyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      lawyers: {
        Row: {
          bio: string | null
          created_at: string
          email: string
          id: string
          is_admin: boolean | null
          name: string
          password_hash: string
          phone: string | null
          picture_url: string | null
          updated_at: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          email: string
          id?: string
          is_admin?: boolean | null
          name: string
          password_hash: string
          phone?: string | null
          picture_url?: string | null
          updated_at?: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          email?: string
          id?: string
          is_admin?: boolean | null
          name?: string
          password_hash?: string
          phone?: string | null
          picture_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      licenses: {
        Row: {
          created_at: string
          expires_at: string | null
          id: number
          is_revoked: boolean | null
          key: string | null
          max_devices: number | null
          plan: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: number
          is_revoked?: boolean | null
          key?: string | null
          max_devices?: number | null
          plan?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: number
          is_revoked?: boolean | null
          key?: string | null
          max_devices?: number | null
          plan?: string | null
        }
        Relationships: []
      }
      office_members: {
        Row: {
          id: string
          joined_at: string
          lawyer_id: string
          office_id: string
          role: string
        }
        Insert: {
          id?: string
          joined_at?: string
          lawyer_id: string
          office_id: string
          role?: string
        }
        Update: {
          id?: string
          joined_at?: string
          lawyer_id?: string
          office_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_members_lawyer_id_fkey"
            columns: ["lawyer_id"]
            isOneToOne: false
            referencedRelation: "lawyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_members_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      offices: {
        Row: {
          address: string | null
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          owner_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          owner_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offices_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "lawyers"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_lawyer_id: string | null
          case_id: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          notes: string | null
          office_id: string
          status: string
          title: string
        }
        Insert: {
          assigned_lawyer_id?: string | null
          case_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          office_id: string
          status?: string
          title: string
        }
        Update: {
          assigned_lawyer_id?: string | null
          case_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          office_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_lawyer_id_fkey"
            columns: ["assigned_lawyer_id"]
            isOneToOne: false
            referencedRelation: "lawyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      trials: {
        Row: {
          created_at: string
          expires_at: string
          id: number
          machine_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: number
          machine_id?: string | null
          type: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: number
          machine_id?: string | null
          type?: string
        }
        Relationships: []
      }
      used_devices: {
        Row: {
          activated_at: string | null
          created_at: string
          id: number
          last_seen_at: string | null
          license_id: number | null
          machine_id: string | null
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          id?: number
          last_seen_at?: string | null
          license_id?: number | null
          machine_id?: string | null
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          id?: number
          last_seen_at?: string | null
          license_id?: number | null
          machine_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "used_devices_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      case_degree_enum: "أول درجة" | "استئناف" | "نقض" | "التماس"
      case_status_enum:
        | "قضية جديدة"
        | "قيد المراجعة"
        | "تم رفع الدعوى"
        | "قيد النظر"
        | "انتظار الجلسة"
        | "تم تحديد جلسة"
        | "قيد التحقيق"
        | "انتظار الحكم"
        | "تم الاستئناف"
        | "تنفيذ الحكم"
        | "موقوفة"
        | "مغلقة"
        | "كسبت"
        | "خُسرت"
        | "تمت التسوية"
        | "رُفضت"
        | "تم التنازل عنها"
      case_type_enum:
        | "مدني"
        | "جنائي"
        | "تجاري"
        | "عمالي"
        | "أحوال شخصية"
        | "إداري"
        | "تنفيذ"
        | "تعويضات"
        | "إيجارات"
        | "اقتصادي"
        | "ضرائب"
        | "جمارك"
      client_status: "نشط" | "متوقف"
      client_type_enum:
        | "فرد"
        | "شركة تضامن"
        | "شركة توصية بسيطة"
        | "شركة مساهمة"
        | "شركة ذات مسؤولية محدودة"
        | "شركة الشخص الواحد"
        | "جهة حكومية"
        | "أخرى"
      egyptian_governorate:
        | "القاهرة"
        | "الجيزة"
        | "الإسكندرية"
        | "الدقهلية"
        | "البحر الأحمر"
        | "البحيرة"
        | "الفيوم"
        | "الغربية"
        | "الإسماعيلية"
        | "المنوفية"
        | "المنيا"
        | "القليوبية"
        | "الوادي الجديد"
        | "السويس"
        | "أسوان"
        | "أسيوط"
        | "بني سويف"
        | "بورسعيد"
        | "دمياط"
        | "الشرقية"
        | "جنوب سيناء"
        | "كفر الشيخ"
        | "مطروح"
        | "الأقصر"
        | "قنا"
        | "شمال سيناء"
        | "سوهاج"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      case_degree_enum: ["أول درجة", "استئناف", "نقض", "التماس"],
      case_status_enum: [
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
      ],
      case_type_enum: [
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
      ],
      client_status: ["نشط", "متوقف"],
      client_type_enum: [
        "فرد",
        "شركة تضامن",
        "شركة توصية بسيطة",
        "شركة مساهمة",
        "شركة ذات مسؤولية محدودة",
        "شركة الشخص الواحد",
        "جهة حكومية",
        "أخرى",
      ],
      egyptian_governorate: [
        "القاهرة",
        "الجيزة",
        "الإسكندرية",
        "الدقهلية",
        "البحر الأحمر",
        "البحيرة",
        "الفيوم",
        "الغربية",
        "الإسماعيلية",
        "المنوفية",
        "المنيا",
        "القليوبية",
        "الوادي الجديد",
        "السويس",
        "أسوان",
        "أسيوط",
        "بني سويف",
        "بورسعيد",
        "دمياط",
        "الشرقية",
        "جنوب سيناء",
        "كفر الشيخ",
        "مطروح",
        "الأقصر",
        "قنا",
        "شمال سيناء",
        "سوهاج",
      ],
    },
  },
} as const
