import mongoose from "mongoose";
import { db_name } from "../constants.js";

let isConnected = false;

export const connectDB = async () => {
    if (isConnected || mongoose.connection.readyState === 1) {
        return;
    }
    try {
        const connectionInstance = await mongoose.connect(`${process.env.MONGODB_URI}/${db_name}`);
        isConnected = true;
        console.log("\nMONGODB Connected Successfully DB-HOST: " + connectionInstance.connection.host);
    } catch (error) {
        console.log("\nMONGODB connection error.", error);
        if (!process.env.VERCEL) {
            process.exit(1);
        } else {
            throw error;
        }
    }
};