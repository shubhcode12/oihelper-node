const express = require("express");
const axios = require("axios");
const admin = require("firebase-admin");
const serviceAccount = require("./firebaseService/oihelper-firebase-adminsdk-pdkvc-eec93047f1.json");
const cron = require("node-cron");

// Caching variables
let cachedData = null;
let cacheExpiry = 0;
const cacheDuration = 5 * 1000; // Cache data for 5 seconds

// Initialize Firebase admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://oihelper-default-rtdb.firebaseio.com",
});

const db = admin.database();

const app = express();
const port = 3000;

const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();

app.use(bodyParser.json());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

var corsOptions = {
  origin: "*",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  preflightContinue: false,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));

app.get("/", (req, res) => {
  res.send("API Working fine");
});

app.get("/prevspotchart", async (req, res) => {
  try {
    const snapshot = await db.ref("previousSpotChartData").orderByChild("timestamp").limitToLast(5).once("value");
    const data = snapshot.val();
    const previousSpotChartData = data ? Object.values(data) : [];

    res.json({ previousSpotChartData });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch previous data" });
  }
});

app.get("/getUnderlyingValue", async (req, res) => {
  try {
    const currentTime = Date.now();
    if (cachedData && currentTime < cacheExpiry) {
      // Serve cached data if available and not expired
      res.json({ underlyingValue: cachedData });
      return;
    }

    const response = await axios.get(
      "https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY"
    );
    const data = response.data;
    const underlyingValue = data?.records?.underlyingValue;
    console.log("New UnderLying Value :  " + underlyingValue); 

    // Save the current underlyingValue and timestamp in Firebase Realtime Database
    const timestamp = admin.database.ServerValue.TIMESTAMP;
    await db.ref("previousSpotChartData").push({ underlyingValue, timestamp });

    // Update cache with new data
    cachedData = underlyingValue;
    cacheExpiry = currentTime + cacheDuration;

     // Set cache-control headers
     res.setHeader("Cache-Control", "public, max-age=60"); // Cache the response for 60 seconds

    res.json({ underlyingValue });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data" });
  }

});

async function fetchAndSaveUnderlyingValue() {
  try {
    const response = await axios.get(
      "https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY"
    );
    const data = response.data;
    const underlyingValue = data?.records?.underlyingValue;

    console.log("Cron job running : " + underlyingValue); 

    // Save the current underlyingValue and timestamp in Firebase Realtime Database
    const timestamp = admin.database.ServerValue.TIMESTAMP;
    await db.ref("previousSpotChartData").push({ underlyingValue, timestamp });

    // Update cache with new data
    cachedData = underlyingValue;
    cacheExpiry = Date.now() + cacheDuration;
  } catch (error) {
    console.error("Failed to fetch and save underlying value:", error);
  }
}

// Schedule the job to run every 20 seconds
  cron.schedule("*/10 * * * * *", () => {
    const currentTime = new Date();
    const marketStartTime = new Date();
    marketStartTime.setHours(9, 0, 0); // Set market start time to 9 am
    const marketEndTime = new Date();
    marketEndTime.setHours(21, 30, 0); // Set market end time to 3:30 pm

    if (currentTime >= marketStartTime && currentTime <= marketEndTime) {
      console.log("hello")
      //fetchAndSaveUnderlyingValue();
    }
  });


app.listen(port, () => console.log(`Oihelper app listening on port ${port}!`));
