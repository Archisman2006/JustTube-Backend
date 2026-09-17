import { v2 as cloudinary } from 'cloudinary';
import fs from "fs"
import dotenv from 'dotenv';
import { ApiError } from './ApiError.js';

// make sure environment variables are loaded as soon as this module is required
dotenv.config();

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    console.error('Missing Cloudinary configuration in environment variables:', {
        CLOUDINARY_CLOUD_NAME: !!CLOUDINARY_CLOUD_NAME,
        CLOUDINARY_API_KEY: !!CLOUDINARY_API_KEY,
        CLOUDINARY_API_SECRET: !!CLOUDINARY_API_SECRET,
    });
    // Optionally you could throw here to catch misconfiguration early
    // throw new Error('Cloudinary environment variables are not set');
}

cloudinary.config({ 
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET
});
const uploadOnCloudinary=async (localFilePath,options={})=>{
    try {
        if(!localFilePath) return null;
        const response=await cloudinary.uploader.upload(localFilePath,{
            resource_type:"auto",
            ...options
        })
        console.log("File uploaded successfully on Cloudinary. URL: "+response.secure_url); 
        fs.unlinkSync(localFilePath);
        return response;
    } catch (error) {
        console.error("Cloudinary upload error:", error);
        try {
            fs.unlinkSync(localFilePath);
        } catch (deleteError) {
            console.error("Error deleting local file:", deleteError);
        }
        return null; 
    }
}
const getPublicIdFromCloudinaryURL=(fileUrl)=>{
    try {
        const parsedUrl=new URL(fileUrl)
        const pathParts=parsedUrl.pathname.split('/').filter(Boolean)
        const uploadIndex = pathParts.findIndex((part) => part === "upload");
        if (uploadIndex === -1) return null;
        const publicIdParts = pathParts.slice(uploadIndex + 1);
        if (publicIdParts[0] && /^v\d+$/.test(publicIdParts[0])){ 
            publicIdParts.shift();
        }
        if (!publicIdParts.length) return null;
        const lastIndex = publicIdParts.length - 1;
        publicIdParts[lastIndex] = publicIdParts[lastIndex].replace(/.[^/.]+$/, "");
        return publicIdParts.join("/");
    } catch (error) {
        throw new ApiError(401,"Error occured while fetching public id from cloudinary")
    }

}

const deleteFromCloudinary= async (fileUrl,resourceType="auto")=>{
    try {
        if(!fileUrl) return null;
        const publicId=getPublicIdFromCloudinaryURL(fileUrl);
        if(!publicId){
            throw new ApiError(400,"Could not extract cloudinary url from URL.");
        }
        return await cloudinary.uploader.destroy(publicId,{resource_type:resourceType});
    } catch (error) {
        throw new ApiError("Error while deleting file from cloudinary");
    }
}
export {uploadOnCloudinary,deleteFromCloudinary}


