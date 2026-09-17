import { connectDB } from "../../src/db/index.js";
import { pruneGhostComments } from "../../src/utils/pruneGhostComments.js";

export default async function handler(req, res) {
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized: Invalid or missing Cron secret token"
        });
    }

    try {
        await connectDB();
        const deletedCount = await pruneGhostComments();
        return res.status(200).json({
            success: true,
            message: `Successfully pruned ${deletedCount} ghost comment(s).`,
            deletedCount
        });
    } catch (error) {
        console.error("Error during ghost comment pruning:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error during ghost comment pruning.",
            error: error.message
        });
    }
}
