import express from 'express'
import cookieParser from "cookie-parser";
import cors from 'cors'
const app=express();
app.use(cors({
    origin:[process.env.CORS_ORIGIN,process.env.FRONTEND_CORS_ORIGIN],
    credentials:true,
    methods:["GET","POST","PUT","DELETE","PATCH","OPTIONS"]
}));
app.use(express.json({limit:"512kb"}));
app.use(express.urlencoded({extended:true,limit:"1024kb"}));
app.use(express.static("public"))
app.use(cookieParser());
import userRouter from './routes/user.routes.js'
import videoRouter from './routes/video.routes.js'
import subscriptionRouter from './routes/subscription.routes.js'
import commentRouter from './routes/comment.routes.js'
import likeRouter from './routes/like.routes.js'
import playlistRouter from './routes/playlist.routes.js'
import dashboardRouter from './routes/dashboard.routes.js'
import tweetRouter from './routes/tweet.routes.js'
import cronRouter from './routes/cron.routes.js'
import { errorHandler } from './middlewares/error.middleware.js';
app.use("/api/v1/users",userRouter)
app.use("/api/v1/videos",videoRouter)
app.use("/api/v1/subscriptions",subscriptionRouter)
app.use("/api/v1/comments",commentRouter)
app.use("/api/v1/likes",likeRouter)
app.use("/api/v1/playlists",playlistRouter)
app.use("/api/v1/dashboard",dashboardRouter)
app.use("/api/v1/tweets",tweetRouter)
app.use("/api/v1/cron", cronRouter)
app.use(errorHandler);
export {app}