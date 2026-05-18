// redis.js
import { Redis } from "ioredis";

export const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASS,
  maxRetriesPerRequest: null,
});

redis.on("connect", () => {
  console.log("🚀 Redis connected successfully!");
});

redis.on("ready", () => {
  console.log("✅ Redis is ready to use");
});

redis.on("error", (err) => {
  console.error("❌ Redis connection error:", err);
});

redis.on("end", () => {
  console.log("⚠️ Redis connection closed");
});