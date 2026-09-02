import { type Request, type Response } from "express";
import Trial from "../Models/Trial.js";
import signLicense from "../Services/signLicense.js";
import logger from "../utils/logger.js";
import supabase from "../Services/supabaseClient.js";

async function StartTrial(req: Request, res: Response) {
  try {
    const { machineId } = req.body;
    if (!machineId) {
      logger.warn("BeginTrial called without machineId");
      return res.status(400).json({
        success: false,
        message: "Machine ID is required",
      });
    }

    const { data: trial, error } = await supabase
      .from("trials")
      .upsert(
        { machine_id: machineId, type: "trial" },
        { onConflict: "machine_id" },
      )
      .select()
      .single();

    if (error) {
      logger.error(
        `Error while fetching trial from supabase : ${error.message}`,
      );
      return res.status(500).json({ success: false, message: "DB error" });
    }
    const isExpired = new Date(trial.expires_at) < new Date();
    if (isExpired)
      return res
        .status(403)
        .json({ success: false, message: "Trial is expired" });

    logger.info(`Trial is being created for machine_id : ${machineId}`);
    return res.status(201).json({
      success: true,
      message: "Trial started successfully",
      data: signLicense(trial),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`BeginTrial error: ${err}`);
    return res.status(500).json({ success: false, message: "server error" });
  }
}

export default StartTrial;
