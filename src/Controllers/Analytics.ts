import AnalyticsModel from "../Models/Analytics.js";
import logger from "../utils/logger.js";
import type { Request, Response } from "express";

async function numberOfDownloads(req: Request, res: Response) {
  try {
    logger.info("Fetching number of downloads");

    const analytics = await AnalyticsModel.findOneAndUpdate(
      { key: "global" },
      { $inc: { numberOfDownloads: 0 } },
      { upsert: true },
    );

    return res.status(200).json(analytics?.numberOfDownloads);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Error fetching downloads", {
      message,
      stack: err instanceof Error ? err.stack : undefined,
    });

    return res.status(500).json("server error");
  }
}

async function increamentDownloads(req: Request, res: Response) {
  try {
    logger.info("Incrementing downloads");

    await AnalyticsModel.updateOne(
      { key: "global" },
      { $inc: { numberOfDownloads: 1 } },
    );

    logger.info("Downloads incremented successfully");

    return res.status(200).json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Error incrementing downloads", {
      message,
      stack: err instanceof Error ? err.stack : undefined,
    });

    return res.status(500).json("server error");
  }
}

export { numberOfDownloads, increamentDownloads };
