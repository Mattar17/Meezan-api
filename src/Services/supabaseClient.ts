import { createClient } from "@supabase/supabase-js";
import { Database } from "../types/database.types.js";
import "dotenv/config";

const supabase = createClient<Database>(
  process.env.PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
);

export default supabase;
