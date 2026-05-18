// queue.js
import { Queue } from "bullmq";
import { redis } from "./redis.js";

export const PaymentQueue = new Queue("evaluation-payment", { connection: redis });