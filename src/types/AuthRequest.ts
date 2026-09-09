import type { Request } from "express";

export interface IAuthRequest<P=Record<string,string> , ResBody=any , ReqBody=any,ReqQuery=any> extends Request<P,ResBody,ReqBody,ReqQuery> {

  token?: {
    is_admin?: boolean;
    lawyer_token?: string;
    lawyer_id?: string;
  };
}

export type AuthRequest = IAuthRequest;
