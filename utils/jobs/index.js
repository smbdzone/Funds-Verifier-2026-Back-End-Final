import { PaymentQueue } from "../../libs/bullmq.js";

// Example function to add jobs
export const AddPaymentJob = async (data) => {
    try {
        const addedJob = await PaymentQueue.add("evaluationPayment", data, {
            attempts: 12,
            delay: 90 * 24 * 60 * 60 * 1000, // ⏳ wait 90 days before first run
            // delay: 60 * 1000,
            jobId: data?.jobId ? String(data?.jobId) : undefined,
            backoff: {
                type: "fixed",
                // delay: 5000,
                delay: 24 * 60 * 60 * 1000, // ⏳ 1 day
            },
            removeOnComplete: true,
            removeOnFail: false,
        });
    } catch (error) {
        console.error("Error adding job to queue:", error);
    }
};