import { Comment } from "../models/comment.model.js";
import { Like } from "../models/like.model.js";

/**
 * Iterative bottom-up pruning loop to hard-delete soft-deleted comments that have 0 remaining child replies.
 * Runs iteratively until a pass deletes 0 documents, ensuring nested ghost comment subtrees are fully pruned.
 * @returns {Promise<number>} Total number of ghost comment documents hard-deleted.
 */
export const pruneGhostComments = async () => {
    let totalDeleted = 0;

    while (true) {
        // 1. Fetch all soft-deleted comment IDs
        const softDeletedComments = await Comment.find({ isDeleted: true }).select("_id").lean();
        if (!softDeletedComments.length) {
            break;
        }

        const softDeletedIds = softDeletedComments.map((c) => c._id);

        // 2. Identify which of these soft-deleted IDs are still referenced as a parent (`comment`) by any existing comment
        const referencedParentIdsRaw = await Comment.distinct("comment", {
            comment: { $in: softDeletedIds }
        });

        const referencedParentIdSet = new Set(
            referencedParentIdsRaw.filter(Boolean).map((id) => id.toString())
        );

        // 3. Leaf comments = soft-deleted comments that have 0 remaining child replies
        const leafCommentIds = softDeletedIds.filter(
            (id) => !referencedParentIdSet.has(id.toString())
        );

        if (!leafCommentIds.length) {
            break;
        }

        // 4. Hard-delete the leaf comments and any associated likes
        await Like.deleteMany({ comment: { $in: leafCommentIds } });
        const deleteResult = await Comment.deleteMany({ _id: { $in: leafCommentIds } });

        const deletedCount = deleteResult.deletedCount || 0;
        totalDeleted += deletedCount;

        if (deletedCount === 0) {
            break;
        }
    }

    return totalDeleted;
};
