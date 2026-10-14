import type { Request } from "express";

<<<<<<< HEAD
export interface IAuthRequest<P=Record<string,string> , ResBody=any , ReqBody=any,ReqQuery=any> extends Request<P,ResBody,ReqBody,ReqQuery> {

=======
interface IAuthRequest extends Request {
>>>>>>> a60ee4f1deba1d483657d098bba392f5818b5f63
  token?: {
    is_admin?: boolean;
    lawyer_token?: string;
    lawyer_id?: string;
  };
}

export type AuthRequest = IAuthRequest;
