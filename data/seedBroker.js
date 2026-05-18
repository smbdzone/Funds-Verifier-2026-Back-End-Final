import mongoose from "mongoose";
import Broker from "../models/BrokerModal.js";

// Connection to MongoDB
const connectDB = async () => {
  try {
    const DBURL = process.env.DBURL
    await mongoose.connect(DBURL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected...");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

// Broker seed data
const brokers = [
  {
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@example.com",
    phone: "555-1234",
  },
  {
    firstName: "Jane",
    lastName: "Smith",
    email: "jane.smith@example.com",
    phone: "555-5678",
  },
  {
    firstName: "Mike",
    lastName: "Johnson",
    email: "mike.johnson@example.com",
    phone: "555-9101",
  },
  {
    firstName: "Sara",
    lastName: "Williams",
    email: "sara.williams@example.com",
    phone: "555-1213",
  },
];

// Seed function to insert brokers into the database
const seedBrokers = async () => {
  try {
    await Broker.insertMany(brokers); // Insert brokers into Broker collection
    mongoose.connection.close(); // Close connection after completion
  } catch (err) {
    console.error(err.message);
    mongoose.connection.close();
  }
};

// Initialize and seed the database
const seedDatabase = async () => {
  await connectDB(); // Connect to the database
  await seedBrokers(); // Seed the broker data
};

seedDatabase();
