import jwt from "jsonwebtoken";

interface TokenPayload {
  lawyer_id?:string,
  lawyer_email?:string,
  is_admin?:boolean
}

interface AuthTokens {
  accessToken:string,
  refreshToken : string
}
export default function generateToken(payload: TokenPayload) : AuthTokens {

  const accessKey = process.env.JWT_ACCESS_SECRET
  const refreshKey = process.env.JWT_REFRESH_SECRET

  if (!accessKey || !refreshKey)
    throw Error("Keys are missing !!");
  
  const refreshToken = jwt.sign({lawyer_id:payload.lawyer_id},refreshKey,{expiresIn:"30d"})
  const accessToken = jwt.sign(payload,accessKey,{expiresIn:"1h"});

  return {accessToken,refreshToken}
}
