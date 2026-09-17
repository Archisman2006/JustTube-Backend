import mongoose from 'mongoose'
import mongooseAggregatePaginate from 'mongoose-aggregate-paginate-v2';
import { ApiError } from '../utils/ApiError.js';
const commentSchema=new mongoose.Schema(
    {
        content:{
            type: String,required:true
        },
        video:{
            type: mongoose.Schema.Types.ObjectId,
            ref:'Video'
        },
        tweet:{
            type: mongoose.Schema.Types.ObjectId,
            ref:'Tweet'
        },
        comment:{
            type:mongoose.Schema.Types.ObjectId,
            ref:'Comment'
        },
        owner:{
            type: mongoose.Schema.Types.ObjectId,
            ref:'User',required:true        
        },
        isEdited:{
            type:Boolean, required:true
        },
        isDeleted:{
            type:Boolean, default:false, required:true
        }
    },{
        timestamps:true
    }
)
commentSchema.pre("validate", function () {
    const parentCount = [this.video, this.tweet, this.comment].filter(Boolean).length;
    if (parentCount !==1) {
        throw new ApiError(400, "Comment must belong to exactly one target- video, tweet or comment");
    }
});

commentSchema.index({ isDeleted: 1 });
commentSchema.index({ comment: 1 });
commentSchema.index({ video: 1 });
commentSchema.index({ tweet: 1 });

commentSchema.plugin(mongooseAggregatePaginate)
export const Comment=mongoose.model('Comment',commentSchema);