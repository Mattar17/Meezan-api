import {z} from "zod";
import { Database } from "../types/database.types.js";

// Extract DB enum types for type safety
type ClientStatus = Database["public"]["Enums"]["client_status"];
type EgyptianGovernorate = Database["public"]["Enums"]["egyptian_governorate"];

// Valid values for each enum — keep in sync with DB
const clientStatusValues: [ClientStatus, ...ClientStatus[]] = ["نشط", "متوقف"];
const governorateValues: [EgyptianGovernorate, ...EgyptianGovernorate[]] = [
    "القاهرة", "الجيزة", "الإسكندرية", "الدقهلية", "البحر الأحمر",
    "البحيرة", "الفيوم", "الغربية", "الإسماعيلية", "المنوفية",
    "المنيا", "القليوبية", "الوادي الجديد", "السويس", "أسوان",
    "أسيوط", "بني سويف", "بورسعيد", "دمياط", "الشرقية",
    "جنوب سيناء", "كفر الشيخ", "مطروح", "الأقصر", "قنا",
    "شمال سيناء", "سوهاج",
];

export const createClientSchema = z.object({
    name: z.string().min(2, "الاسم مطلوب"),
    client_type: z.string().optional(),
    file_number: z.string().optional(),
    phone_number: z.string().regex(/^\d{11}$/, "رقم الهاتف غير صحيح").optional(),
    national_id: z.string().regex(/^\d{14}$/, "الرقم القومي غير صحيح").optional(),
    address: z.string().optional(),
    job: z.string().optional(),
    governorate: z.enum(governorateValues).optional(),
    file_opening_date: z.string().optional(),
    client_state: z.enum(clientStatusValues).optional(),
    notes: z.string().optional(),
})

export const updateClientSchema = createClientSchema.partial().refine(
    (data) => Object.keys(data).length > 0,
    { message: "يجب توفير حقل واحد على الأقل للتعديل" }
)