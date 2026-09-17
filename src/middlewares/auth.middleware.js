import { User } from "../models/user.models.js";
import { ApiError } from "../utils/ApiError.js";
import { asynchandler } from "../utils/asyncHandler.js";
import jwt from 'jsonwebtoken'
export const VerifyJWT=asynchandler(async (req,res,next)=>{
    try{
        const token=
    req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ","")
    if(!token){
        throw new ApiError(401,"UnAuthorised Error");
    }
    const decodedToken=jwt.verify(token,process.env.ACCESS_TOKEN_SECRET);
    const user= await User.findById(decodedToken._id).select("-password -refreshToken")
    if(!user){
        throw new ApiError(401,"Invalid Access Token");
    }
    req.user=user;
    next();
    }
    catch(error){
        throw new ApiError(401,error?.message || "Access Token invalid");
    }
});
export const OptionalVerifyJWT=asynchandler(async (req,res,next)=>{
    try {
        const token=
    req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ","")
    if(!token){
        req.user=null; return next();
    }
    const decodedToken=jwt.verify(token,process.env.ACCESS_TOKEN_SECRET);
    const user= await User.findById(decodedToken._id).select("-password -refreshToken")
    req.user=user;
    next();
    } catch (error) {
        req.user=null;
        next();
    }
});
