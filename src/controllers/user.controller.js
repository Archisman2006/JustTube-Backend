import {asynchandler} from '../utils/asyncHandler.js'
import {ApiError} from '../utils/ApiError.js'
import {User} from '../models/user.models.js'
import {deleteFromCloudinary, uploadOnCloudinary} from '../utils/cloudinary.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import crypto from 'crypto'
import { sendVerificationCode, sendWelcomeEmail,sendResetPasswordLink } from '../middlewares/email.middleware.js'
import { VERIFICATION_CODE_EXPIRY_MS,RESET_PASSWORD_TOKEN_EXPIRY_MS } from '../constants.js'
const getAccessAndRefreshTokens=async (userid,user)=>{
    //const user=User.findById(userid);
    const accessToken=user.generateAccessToken();
    const refreshToken=user.generateRefreshToken();
    user.refreshToken=refreshToken;
    await user.save({validateBeforeSave:false});
    return {accessToken,refreshToken};
}
const registerUser=asynchandler(async (req,res)=>{
    const body = req.body || {};
    // get user details from frontend
    const {username,email,fullName,password}=body
    //validation
    if([username,email,fullName,password].some((i)=>i?.trim()==="")) throw new ApiError(400,"All fields are Required");
    //check if user already exists
    const userExists=await User.findOne({
        $or:[{username},{email}]
    })
    if(userExists) throw new ApiError(409,"User Already Exists");
    //check for images,avatar
    const avatar_localpath=req.files?.avatar?.[0]?.path; 
    //console.log(avatar_localpath);
    let coverImage_localpath=null;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length>0){
        coverImage_localpath=req.files.coverImage[0].path;
    }
    if(!avatar_localpath) throw new ApiError(400,"Avatar is required");
    //upload to cloudinary
    const avatar=await uploadOnCloudinary(avatar_localpath);
    const coverImage=(coverImage_localpath==null)?null:await uploadOnCloudinary(coverImage_localpath);
    if(!avatar) throw new ApiError(400,"Avatar is required. 111");
    //create email verification code and expiry
    const code=Math.floor(100000+Math.random()*900000).toString();
    const expiry = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MS);
    //create user object
    const user=await User.create({fullName,avatar:avatar.secure_url,coverImage:coverImage?.secure_url||"",email,
        password,username:username.toLowerCase(),verificationCode:code,isVerified:false,
    verificationCodeExpiry:expiry});
    //remove password and refresh token field from response
    //console.log(User);
    await sendVerificationCode(user.email,code);
    const createdUser=await User.findById(user._id).select("-password -refreshToken");
    //check for user creation
    if(!createdUser){
        throw new ApiError(500,"User Registration failed");
    }
    //return res
    return res.status(201).json(
        new ApiResponse(200,createdUser,"User created Successfully")
    )
})
const verifyEmail=asynchandler(async (req,res)=>{
    const {code}=req?.body;
    const user=await User.findOne({
        verificationCode:code
    })
    if(!user) throw new ApiError(404,"Invalid or expired code provided");
    if(user.verificationCodeExpiry && user.verificationCodeExpiry<new Date())
        throw new ApiError(410,"Verification code has expired");
    user.verificationCode=undefined;
    user.isVerified=true;
    user.verificationCodeExpiry=undefined;
    await user.save({validateBeforeSave:false});
    await sendWelcomeEmail(user.email,user.fullName);
    return res.status(200).json(
        new ApiResponse(200,user,"Email Verification Successful")
    )
})
const resendVerificationCode=asynchandler(async (req,res)=>{
    const {email}=req?.body;
    const user=await User.findOne({email});
    if(!user) throw new ApiError(404,"User with given email doesn't exist")
    if(user.isVerified) throw new ApiError(400,"user is already verified");
    const code=Math.floor(100000+Math.random()*900000);
    const expiry=new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MS);
    user.verificationCode=code;
    user.verificationCodeExpiry=expiry;
    await user.save({validateBeforeSave:false});
    await sendVerificationCode(user.email,code);
    return res.status(200).json(
        new ApiResponse(200,"verification code resent successfully")
    )
})
const loginUser=asynchandler(async (req,res)=>{
    // get data from req.body
    const {identifier,password}=req.body;
    if(!identifier) throw new ApiError(400,"Either email or username is required");
    const user=await User.findOne({$or:[
        {email:identifier},{username:identifier.toLowerCase()}
    ]});
    //validate if user exists
    if(!user) throw new ApiError(404,"User Doesn't exist");
    //check if password is correct
    const valid=await user.isPasswordCorrect(password);
    if(!valid) throw new ApiError(401,"Password is Invalid");
    //do not log user in if email is not verified
    if(!user.isVerified) {
        const code=Math.floor(100000+Math.random()*900000).toString();
        const expiry = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MS);
        user.verificationCode=code;
        user.verificationCodeExpiry=expiry;
        await user.save({validateBeforeSave:false});
        await sendVerificationCode(user.email,code);
        return res.status(200).json(
            new ApiResponse(200,{user},"User not verified yet. Verification mail has been sent.")
        )
    }
    //generate access and refresh token
    const {accessToken,refreshToken}=await getAccessAndRefreshTokens(user._id,user);
    const loggedInUser=await User.findById(user._id)
    .select("-password -refreshToken");
    const options={
        httpOnly: true,secure:true,sameSite:'none'
    };
    return res.status(200)
    .cookie("accessToken",accessToken,options)
    .cookie("refreshToken",refreshToken,options)
    .json(
        new ApiResponse(
            200,
            {
                user:loggedInUser
            },
            "User logged in Successfully"
        )
    )
})
const generateResetPasswordToken=asynchandler(async (req,res)=>{
    const {email}=req.body;
    const user=await User.findOne({email});
    if(!user){
        return res.status(200).json(
        new ApiResponse(200,{},"...")
    );
    }
    const token=crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken=token;
    user.resetPasswordTokenExpiry=new Date(Date.now()+RESET_PASSWORD_TOKEN_EXPIRY_MS);
    await user.save({validateBeforeSave:false});
    sendResetPasswordLink(email,token);
    return res.status(200).json(
        new ApiResponse(200,{},"...")
    );
})
const resetPassword=asynchandler(async (req,res)=>{
    const {token,newPassword}=req.body;
    if(!token) return new ApiError(403,"session expired");
    if(!newPassword || newPassword.trim()==='') return ApiError(400,"Password is required");
    const user=await User.findOne({resetPasswordToken:token});
    console.log(user);
    if(!user) return new ApiError(400,"Token invalid or already used");
    if(user.resetPasswordTokenExpiry && user.resetPasswordTokenExpiry<new Date()){
        return new ApiError(400,"token is expired. Please Request again.");
    }
    user.resetPasswordToken=null;
    user.resetPasswordTokenExpiry=null;
    user.password=newPassword;
    await user.save({validateBeforeSave:false});
    return res.status(200).json(
        new ApiResponse(200,{},"password changed successfully. Log in with new password.")
    )
})
const googleLogin=asynchandler(async (req,res)=>{
    const {token}=req.body;
    if(!token) throw new ApiError(400,"Google credential token is required");
    
    const response= await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
    const ticket = await response.json();
    if(!response.ok || ticket.error || ticket.error_description){
        throw new ApiError(400,ticket.error_description || ticket.error || "invalid Google token");
    }

    //client ID safety check
    if (ticket.aud !== process.env.GOOGLE_CLIENT_ID) {
        throw new ApiError(400, "Google token client ID mismatch");
    }

    const { sub: googleId, email, email_verified, name: fullName, picture: avatar } = ticket;
    const isEmailVerified = email_verified === true || email_verified === "true";

    // Check if user exists by email
    let user = await User.findOne({ email });

    if (!user) {
        // If email does not exist: generate a short-lived temporary JWT
        const tempToken = jwt.sign(
            { email, googleId, fullName, avatar },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: "15m" }
        );

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    tempToken,
                    email,
                    fullName,
                    avatar,
                    usernameRequired: true
                },
                "Google authenticated. Username required to complete signup."
            )
        );
    }

    // If email exists: check googleId
    if (user.googleId) {
        if (user.googleId !== googleId) {
            throw new ApiError(400, "This email is registered using a different login/Google method.");
        }
    } else {
        // If googleId is not set, verify Google email and link it
        if (!isEmailVerified) {
            throw new ApiError(400, "Google account email is not verified.");
        }
        user.googleId = googleId;
        user.isVerified = true;
        await user.save({ validateBeforeSave: false });
    }

    // Issue tokens and log in
    const { accessToken, refreshToken } = await getAccessAndRefreshTokens(user._id, user);
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

    const options = {
        httpOnly: true,
        secure: true,
        sameSite: 'none'
    };

    return res.status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                { user: loggedInUser },
                "User logged in successfully"
            )
        );
})
const googleRegister=asynchandler(async (req,res)=>{
    const { username, tempToken } = req.body;

    if (!username || username.trim() === "") {
        throw new ApiError(400, "Username is required");
    }
    if (!tempToken) {
        throw new ApiError(400, "Temporary registration token is required");
    }

    const cleanedUsername = username.trim().toLowerCase();

    // Verify the temporary registration token
    let decoded;
    try {
        decoded = jwt.verify(
            tempToken,
            process.env.ACCESS_TOKEN_SECRET
        );
    } catch (error) {
        throw new ApiError(400, "Invalid or expired temporary registration token");
    }

    const { email, googleId, fullName, avatar } = decoded;

    // Double check email/username uniqueness
    const emailExists = await User.findOne({ email });
    if (emailExists) {
        throw new ApiError(409, "User with this email already exists");
    }

    const usernameExists = await User.findOne({ username: cleanedUsername });
    if (usernameExists) {
        throw new ApiError(409, "Username is already taken");
    }

    // Create the user
    const user = await User.create({
        username: cleanedUsername,
        email,
        fullName,
        avatar,
        googleId,
        isVerified: true
    });

    try {
        await sendWelcomeEmail(user.email, user.fullName);
    } catch (emailError) {
        console.error("Failed to send welcome email:", emailError);
    }

    // Generate tokens and log in
    const { accessToken, refreshToken } = await getAccessAndRefreshTokens(user._id, user);
    const createdUser = await User.findById(user._id).select("-password -refreshToken");

    if (!createdUser) {
        throw new ApiError(500, "Google User registration failed");
    }

    const options = {
        httpOnly: true,
        secure: true,
        sameSite: 'none'
    };

    return res.status(201)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                201,
                { user: createdUser },
                "Google registration completed successfully"
            )
        );
})
const checkUsername = asynchandler(async (req, res) => {
    const { username } = req.params;
    if (!username || username.trim() === "") {
        throw new ApiError(400, "Username is required");
    }
    const cleanedUsername = username.trim().toLowerCase();
    const userExists = await User.findOne({ username: cleanedUsername });
    return res.status(200).json(
        new ApiResponse(
            200,
            { available: !userExists },
            userExists ? "Username is already taken" : "Username is available"
        )
    );
});
const logoutUser=asynchandler(async (req,res)=>{
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{
                refreshToken:undefined
            },
        },
        {
            new:true
        }
    )
    const options={
        httpOnly:true,
        secure:true
    }
    return res.status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json(new ApiResponse(
        200,{},"User Logged Out"
    ))
})
const getAllUsers=asynchandler(async (req,res)=>{
    const {page,limit,query}=req.query;
    const  parsedPage=Math.max(parseInt(page,10)|| 1,1)
    const parsedLimit=Math.min(Math.max(parseInt(limit,10) || 10,1),50)
    const matchStage={};
    if(query && String(query).trim()){
        const searchRegex = { $regex: String(query).trim(), $options: "i" };
        matchStage.$or = [
            {username:searchRegex},
            {fullName:searchRegex}
        ];
    }
    const pipeline=[
        {
            $match:matchStage
        },{
            $project:{
                _id:1,
                username:1,
                fullName:1,
                avatar:1,    
            }
        }
    ]
    const aggregate=User.aggregate(pipeline);
    const users=await User.aggregatePaginate(aggregate,{
        page:parsedPage,limit:parsedLimit
    });
    return res.status(200).json(
        new ApiResponse(200,users,"channels retreived successfully")
    );
})
const refreshAccessToken=asynchandler(async (req,res)=>{
    const incomingRefreshToken=req.cookies.refreshToken || req.body.refreshToken;
    if(!incomingRefreshToken){
        throw new ApiError(401,"Unauthorized Access Denied");
    }
    const decodedToken=jwt.verify(incomingRefreshToken,
        process.env.REFRESH_TOKEN_SECRET);
    const user=await User.findById(decodedToken?._id);
    if(!user){
        throw new ApiError(400,"Invalid refresh token");
    }
    if(incomingRefreshToken !==user?.refreshToken){
        throw new ApiError(401,"Refresh token expired");
    }
    const {accessToken,refreshToken}=await getAccessAndRefreshTokens(user._id,user);
    const options={
        httpOnly:true,
        secure:true
    }
    return res.status(200)
    .cookie("accessToken",accessToken,options)
    .cookie("refreshToken",refreshToken,options)
    .json(
        new ApiResponse(
            200,
            {accessToken,refreshToken},
            "Session restored successfully."
        )
    )
})
const getCurrentUser=asynchandler(async (req,res)=>{
    if(!req.user){
        return res.status(200).json(
            new ApiResponse(200,{},"No user currently logged in")
        )
    }
    return res.status(200)
    .json(
        new ApiResponse(
            200,{   
                user:req.user
            },"Current user retrieved"
        )
    )
})
const updateAccountDetails=asynchandler(async (req,res)=>{
    const {username,email,fullName}=req.body;
    if([username,email,fullName].some((i)=>i?.trim()==="")) 
        throw new ApiError(400,"All fields are Required");
    const user=await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{username,email,fullName}
        },
        {new:true}
    ).select("-password -refreshToken")
    return res.status(200)
    .json(
        new ApiResponse(
            200,{user},"details updated successfully."
        )
    )
})
const updateAvatar=asynchandler(async (req,res)=>{
    const localpath=req.file?.path;
    if(!localpath) throw new ApiError(400,"File path is required");
    const avatar=await uploadOnCloudinary(localpath);
    if(!avatar) throw new ApiError(400,"avatar is invalid");
    const user=await User.findById(req.user._id);
    const newUser=await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{avatar:avatar.secure_url}
        },
        {new:true}
    ).select("-password -refreshToken")
    await deleteFromCloudinary(user.avatar,'image');
    return res.status(200)
    .json(
        new ApiResponse(200,{newUser},"Avatar updated successfully")
    )
})
const updateCoverImage=asynchandler(async (req,res)=>{
    const localpath=req.file?.path;
    if(!localpath) throw new ApiError(400,"file path is required")
    const coverImage=await uploadOnCloudinary(localpath);
    if(!coverImage) throw new ApiError(400,"cover image is invalid");
    const user=await User.findById(req.user._id);
    const newUser= await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{coverImage:coverImage.secure_url}
        },
        {new:true}
    ).select("-password -refreshToken")
    if(user.coverImage){
        await deleteFromCloudinary(user.coverImage,'image');
    }
    return res.status(200)
    .json(
        new ApiResponse(200,{newUser},"Cover image updated Successfully")
    )
})
const getChannelProfile=asynchandler(async (req,res)=>{
    const {username}=req.params
    if(!username) throw new ApiError(401,"username not provided");
    const [channel]=await User.aggregate([{
        $match:{username:username}
    },{
        $lookup:{
            from:'subscriptions',
            localField:'_id',
            foreignField:'channel',
            as:'subscribers'
        }
    },{
        $lookup:{
            from:'subscriptions',
            localField:'_id',
            foreignField:'subscriber',
            as:'subscribedTo'
        }
    },{
        $addFields:{
            subscribersCount:{
                $size: "$subscribers"
            },
            subscribedToCount:{
                $size:"$subscribedTo"
            },
            isSubscribed:{
                $cond: {
                    if:{$in:[req.user?._id,'$subscribers.subscriber']},
                    then:true,else:false
                }
            }
        }
    },{
        $project:{
            username:1,
            fullName:1,
            avatar:1,
            coverImage:1,
            subscribersCount:1,
            subscribedToCount:1,
            isSubscribed:1,
            createdAt:1
        }
    }
    ]
);
return res.status(200).json(
    new ApiResponse(200,channel,"Channel profile retrieved")
)
})
const getWatchHistory=asynchandler(async (req,res)=>{
    const { page = 1, limit = 10 } = req.query;
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    const skipIndex = (parsedPage - 1) * parsedLimit;
    const watchedVideos=await User.aggregate([
        {
            $match:{
                _id:new mongoose.Types.ObjectId(req.user._id)
            }
        },{
            $project:{
                totalVideos:{$size:"$watchHistory"},
                paginatedWatchHistory:{ $slice: ["$watchHistory",skipIndex, parsedLimit] }
            } 
        },{
            $lookup:{
                from:'videos',
                localField:'paginatedWatchHistory',
                foreignField:'_id',
                as:'watchHistory',
                pipeline:[
                    {
                        $lookup:{
                            from:'users',
                            localField:'owner',
                            foreignField:'_id',
                            as:'owner',
                            pipeline:[
                                {
                                    $project:{
                                        fullName:1,
                                        username:1,
                                        avatar:1
                                    }
                                }
                            ]
                        }
                    },{
                        $addFields:{
                            owner:{
                                $first:'$owner'
                            }
                        }
                    },
                    {
                        $project: {
                            videoFile: 1, thumbnail: 1, title: 1, duration: 1, views: 1, owner: 1,createdAt:1
                        }
                    }
                ]
            }
        },
        {
            $project: {
                paginatedWatchHistory: 0
            }
        }
    ]
    )
    const hasNextPage = skipIndex + parsedLimit < watchedVideos[0].totalVideos;
    return res.status(200)
    .json(
        new ApiResponse(200, {videos:watchedVideos[0],hasNextPage},"Watch History retrieved successfully")    
    )
})
const clearWatchHistory=asynchandler(async (req,res)=>{
    await User.findByIdAndUpdate(
        req.user._id,{
            $set:{watchHistory:[]}
        }
    )
    return res.status(200).json(
        new ApiResponse(200,{},"watch history cleared successfully")
    )
})
const removeVideoFromWatchHistory=asynchandler(async (req,res)=>{
    const {videoId}=req.params;
    if(!mongoose.Types.ObjectId.isValid(videoId))
            throw new ApiError(400, "Invalid video ID");
    await User.findByIdAndUpdate(
        req.user._id,{
            $pull:{
                watchHistory:videoId
            }
        }
    )
    return res.status(200).json(
        new ApiResponse(200,{},"video removed from user watch history")
    )
})
export {registerUser,loginUser,logoutUser,refreshAccessToken,getCurrentUser,updateAccountDetails,updateAvatar,
    updateCoverImage,getChannelProfile,getWatchHistory,verifyEmail,
    resendVerificationCode,clearWatchHistory,removeVideoFromWatchHistory,getAllUsers,
    googleLogin,googleRegister,checkUsername,generateResetPasswordToken,resetPassword
}