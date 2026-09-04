import { type Request, type Response } from "express";
import signLicense from "../Services/signLicense.js";
import logger from "../utils/logger.js";
import supabase from "../Services/supabaseClient.js";

export default async function ActivateLicense(req: Request, res: Response) {
  try {
    const { key, machineId } = req.body;

    if (!key || !machineId) {
      return res
        .status(400)
        .json({ success: false, message: "Key and machineId are required" });
    }

    logger.info("ActivateLicense request received", {
      key: key?.slice(0, 5) + "***",
      machineId,
    });

    const { data: license, error: fetchError } = await supabase
      .from("licenses")
      .select("*,used_devices(*)")
      .eq("key", key)
      .single();

    if (fetchError) {
      logger.error("Supabase fetch error", { error: fetchError });
      return res
        .status(500)
        .json({ success: false, message: "Database error" });
    }

    if (!license) {
      logger.warn("License not found", {
        key: key?.slice(0, 5) + "***",
      });
      return res.status(404).json("License doesn't exist");
    }

    if (license.used_devices.length >= license.max_devices!)
      return res
        .status(403)
        .json({ success: false, message: "Devices limit reached" });

    const { data: insertedRow, error: insertError } = await supabase
      .from("used_devices")
      .insert({
        license_id: license.id,
        machine_id: machineId,
        activated_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      });
    if (insertError)
      throw new Error(`Inserting Error:: ${insertError.message}`);
    logger.info("License activated", {
      licenseId: license.id,
      machineId,
      totalDevices: license.used_devices.length,
    });

    const { data: updatedLicense, error: updatedError } = await supabase
      .from("licenses")
      .select("*,used_devices(*)")
      .eq("id", license.id)
      .single();

    if (updatedError) throw updatedError;

    const signedLicense = signLicense(updatedLicense);

    return res.status(201).json({
      success: true,
      data: signedLicense,
    });
  } catch (err:any) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("ActivateLicense error", {
      message: message,
      stack: err.stack,
    });

    return res.status(500).json({ success: false, message: "server error" });
  }
}
