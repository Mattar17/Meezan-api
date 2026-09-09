import type {Response} from "express"
import { IAuthRequest } from "../types/AuthRequest.js"
import logger from "../utils/logger.js";
import crypto from "node:crypto"

import supabase from "../Services/supabaseClient.js";
import generateToken from "../Services/generateToken.js";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
//POST /api/auth/refresh
export async function RefreshToken(req:IAuthRequest,res:Response){
    const isMobile = req.headers["x-client-type"] === "mobile";
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
        .maybeSingle();

        if(fetchTokenError) 
            return res.status(500).json({success:false,message:"Error fetching token"})

        const isExpired = tokenRecord ? new Date(tokenRecord.expires_at).getTime() < Date.now() : true;
        if (!tokenRecord || !tokenRecord.is_valid || isExpired)
            return res.status(403).json({success:false,message:"Invalid or expired refresh token"})


        const lawyer = tokenRecord.lawyers;
            if (!lawyer) {
            return res.status(401).json({
                success: false,
                message: "Associated account not found",
            });
            }

        const {accessToken,refreshToken:newRefreshToken} = generateToken({
            lawyer_email:lawyer.email,
            lawyer_id : lawyer.id,
            is_admin:lawyer.is_admin
        })

        
        const newTokenHash = crypto.createHash("sha256").update(newRefreshToken).digest("hex");
        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString()
        const {error:insertError} = await supabase
        .from("user_refresh_tokens")
        .insert({user_id:tokenRecord.user_id,is_valid:true,token_hash:newTokenHash,expires_at:expiresAt})
        
        if(insertError)
            return res.status(500).json({success:false,message:"Invalid token insert"});
        
        await supabase.from("user_refresh_tokens").delete().eq("id",tokenRecord.id);

    if(isMobile){
        return res.status(200).json({success:true,data:{
            accessToken,newRefreshToken
        }})
    }
    else{

        res.cookie("refreshToken",newRefreshToken,{
            httpOnly:true,
            maxAge : REFRESH_TOKEN_TTL_MS,
            path:"/api/auth",
            sameSite:"strict",
            secure:process.env.NODE_ENV === "production"
        })
        
        return res.status(200).json({
            success: true,
            data: { accessToken},
        }    
    );
    }
}catch(err){
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`[RefreshToken Error] ${message}`)
        return res.status(500).json({success:false,message})
    }
}
