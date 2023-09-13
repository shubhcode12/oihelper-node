const express = require("express");
const axios = require("axios");
const admin = require("firebase-admin");
const serviceAccount = require("./firebaseService/oihelper-firebase-adminsdk-pdkvc-eec93047f1.json");
const cron = require("node-cron");

const userId = process.env.USERID;
const password = process.env.PASSWORD;
const yob = process.env.YOB;
const dbUrl = process.env.DATABASE_URL;

// Initialize Firebase admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://oihelper-default-rtdb.firebaseio.com",
});

const db = admin.firestore();

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
    const snapshot = await db
      .collection("previousSpotChartData")
      .orderBy("timestamp", "desc")
      .limit(5)
      .get();
    const previousSpotChartData = snapshot.docs.map((doc) => doc.data());

    res.json({ previousSpotChartData });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch previous data" });
  }
});

app.get("/getUnderlyingValue", async (req, res) => {
  try {
    const currentTime = Date.now();
    const headers = {
      'Accept': '[asterisk]/[asterisk]',
      'Accept-Encoding': 'gzip, deflate, br',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36',
      'Connection': 'keep-alive',
    };
    if (cachedData && currentTime < cacheExpiry) {
      // Serve cached data if available and not expired
      res.json({ underlyingValue: cachedData });
      return;
    }

    const response = await axios.get(
      "https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY",
      { headers }
    );
    const data = response.data;
    const underlyingValue = data?.records?.underlyingValue;
    console.log("New Underlying Value: " + underlyingValue);

    // Save the current underlyingValue and timestamp in Firebase Firestore
    const timestamp = admin.firestore.Timestamp.now();
    // await db
    //   .collection("previousSpotChartData")
    //   .add({ underlyingValue, timestamp });

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
    const headers = {
      Accept: "*/*",
      "Accept-Encoding": "gzip, deflate, br",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36",
      Connection: "keep-alive",
    };
    const response = await axios.get(
      "https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY",
      { headers }
    );
    const data = response.data;
    const underlyingValue = data?.records?.underlyingValue;

    console.log("Cron job running: " + underlyingValue);

    // Save the current underlyingValue and timestamp in Firebase Firestore
    const timestamp = admin.firestore.Timestamp.now();
    await db
      .collection("previousSpotChartData")
      .add({ underlyingValue, timestamp });

    // Update cache with new data
    cachedData = underlyingValue;
    cacheExpiry = Date.now() + cacheDuration;
  } catch (error) {
    console.error("Failed to fetch and save underlying value:", error);
  }
}

// Schedule the job to run every 20 seconds
// cron.schedule("*/10 * * * * *", () => {
//   const currentTime = new Date();
//   const marketStartTime = new Date();
//   marketStartTime.setHours(9, 0, 0); // Set market start time to 9 am
//   const marketEndTime = new Date();
//   marketEndTime.setHours(21, 30, 0); // Set market end time to 3:30 pm

//   if (currentTime >= marketStartTime && currentTime <= marketEndTime) {
//     console.log("hello");
//     // fetchAndSaveUnderlyingValue();
//   }
// });

app.listen(port, () => console.log(`Oihelper app listening on port ${port}!`));
