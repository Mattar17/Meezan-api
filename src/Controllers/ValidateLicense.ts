import signLicense from "../Services/signLicense.js";
import { type Request, type Response } from "express";
import logger from "../utils/logger.js";
import supabase from "../Services/supabaseClient.js";

export default async function ValidateLicense(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { key } = req.body;

    if (!key) {
      logger.warn("ValidateLicense called without a key");
      return res
        .status(400)
        .json({ success: false, message: "Key is required" });
    }

    const { data, error } = await supabase
      .from("licenses")
      .select("*,used_devices(*)")
      .eq("key", key);

    if (!data || !data.length) {
      logger.warn(`License key not found: ${key}`);
      return res
        .status(404)
        .json({ success: false, message: "Key isn't valid" });
    }
    const license = data[0];
    console.log(license.used_devices.length);
    if (license.used_devices!.length >= license.max_devices!) {
      logger.warn(`Max devices limit reached for key: ${key}`);
      return res
        .status(403)
        .json({ success: false, message: "Max devices limit reached" });
    }

    logger.info(
      `License validated for key: ${key}, usedDevices: ${license.used_devices?.length || 0}`,
    );

    return res
      .status(200)
      .json({ success: true, message: "Valid license", data: license });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`ValidateLicense error: ${err}`);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}
