import { createClient } from "@supabase/supabase-js";
<<<<<<< HEAD
import { Database } from "../types/database.types.js";
import "dotenv/config";

const supabase = createClient<Database>(
=======
import "dotenv/config";

const supabase = createClient(
>>>>>>> a60ee4f1deba1d483657d098bba392f5818b5f63
  process.env.PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
);

export default supabase;
