import mongoose from "mongoose";
import dns from "dns";

const dbConnection = async () => {
  const mongooseUrl = process.env.DBURL;
  const fallbackUrl = process.env.DBURL_FALLBACK;

  // Mobile hotspots and some ISPs often fail SRV DNS lookups.
  // Force stable public resolvers before attempting mongodb+srv.
  dns.setServers(["8.8.8.8", "1.1.1.1"]);

  const connectWithUrl = async (url, label) => {
    if (!url) return false;
    await mongoose.connect(url);
    console.log(`MongoDB connected using ${label} URL`);
    return true;
  };
  try {
    mongoose.connection.on("connected", () => {
      console.log("Database Connected...");
    });

    mongoose.connection.on("error", (err) => {
      console.log("Error in connecting to database.", err);
    });

    await connectWithUrl(mongooseUrl, "primary");
  } catch (error) {
    const isSrvDnsError =
      mongooseUrl?.startsWith("mongodb+srv://") &&
      (error?.code === "ECONNREFUSED" ||
        error?.code === "ENOTFOUND" ||
        error?.syscall === "querySrv");

    if (isSrvDnsError && fallbackUrl) {
      try {
        console.warn(
          "Primary mongodb+srv DNS lookup failed. Trying fallback non-SRV MongoDB URL..."
        );
        await connectWithUrl(fallbackUrl, "fallback");
        return;
      } catch (fallbackError) {
        console.error("Fallback MongoDB connection failed:", fallbackError);
      }
    }

    console.error("Could not connect to MongoDB:", error);
    process.exit(1);
  }
};

export default dbConnection;
