import CaseModel from "../Models/Case.js";
import { type Request, type Response } from "express";
import logger from "../utils/logger.js";

export const getLawyerCases = async function (
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { token } = req.params;

    logger.info("Get lawyer cases request", {
      token: token?.slice(0, 5) + "***",
    });

    const cases = await CaseModel.find({ lawyer_token: `${token}` }).select(
      "-lawyer_token",
    );

    if (cases.length === 0) {
      logger.warn("No cases found for lawyer", {
        token: token?.slice(0, 5) + "***",
      });

      return res.status(404).json({
        success: false,
        message: "No cases found for this lawyer",
      });
    }

    logger.info("Lawyer cases fetched", {
      token: token?.slice(0, 5) + "***",
      count: cases.length,
    });

    return res.status(200).json({
      success: true,
      data: cases,
    });
  } catch (err: any) {
    logger.error("Get lawyer cases error", {
      message: err.message,
      stack: err.stack,
    });

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
