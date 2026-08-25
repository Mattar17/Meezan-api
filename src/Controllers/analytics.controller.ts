import type { Request, Response } from "express";
import supabase from "../Services/supabaseClient.js";
import logger from "../utils/logger.js";

async function handleDownloads(req: Request, res: Response) {
  try {
    const increment = req.query.increment === "1";

    logger.info("Analytics request received", { increment });

    // 1. Try to get current row
    const { data: existing, error: fetchError } = await supabase
      .from("analytics")
      .select("number_of_downloads")
      .eq("key", "global")
      .single();

    // If row doesn't exist, create it
    if (fetchError && fetchError.code === "PGRST116") {
      const { data: created, error: insertError } = await supabase
        .from("analytics")
        .insert({
          key: "global",
          number_of_downloads: increment ? 1 : 0,
        })
        .select("number_of_downloads")
        .single();

      if (insertError) throw insertError;

      return res.status(200).json(created.number_of_downloads);
    }

    if (fetchError) throw fetchError;

    let newValue = existing.number_of_downloads;

    // 2. Increment if requested
    if (increment) {
      const { data: updated, error: updateError } = await supabase
        .from("analytics")
        .update({
          number_of_downloads: existing.number_of_downloads + 1,
        })
        .eq("key", "global")
        .select("number_of_downloads")
        .single();

      if (updateError) throw updateError;

      newValue = updated.number_of_downloads;
    }

    return res.status(200).json(newValue);
  } catch (err: any) {
    logger.error("Analytics error", {
      message: err.message,
      stack: err.stack,
    });

    return res.status(500).json("server error");
  }
}

export { handleDownloads };
