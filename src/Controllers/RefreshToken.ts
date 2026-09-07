import type {Response} from "express"
import { IAuthRequest } from "../types/AuthRequest.js"
import logger from "../utils/logger.js";
import crypto from "node:crypto"

import supabase from "@/Services/supabaseClient.js";
import generateToken from "@/Services/generateToken.js";


//POST /api/refresh
export async function RefreshToken(req:IAuthRequest,res:Response){
    try{
        const {refreshToken} = req.cookies;
        if(!refreshToken){
            return res.status(401).json({success:false,message:"Refresh token is required!!"})
        }

        const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");        
         const {data:tokenRecord,error:fetchTokenError} = await supabase

        .from("user_refresh_tokens")

        .select("id,is_valid,user_id,expires_at,lawyers(id,name,email,is_admin)")

        .eq("token_hash",tokenHash)

        .single();

        if(fetchTokenError) 
            return res.status(500).json({success:false,message:"Error fetching token"})
        if(!tokenRecord)
            return res.status(404).json({success:false,message:"Token doesn't exist or got deleted"})


        if (!tokenRecord.is_valid || tokenRecord.expires_at < new Date(Date.now()).toISOString())
            return res.status(403).json({success:false,message:"Token isn't valid"})

        const {accessToken,refreshToken:newRefreshToken} = generateToken({
            lawyer_email:tokenRecord.lawyers?.email,
            lawyer_id : tokenRecord.lawyers?.id,
            is_admin:tokenRecord.lawyers?.is_admin
        })

        res.json({accessToken,newRefreshToken});
    }catch(err){
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`[RefreshToken Error] ${message}`)
        return res.status(500).json({success:false,message})
    }
}
