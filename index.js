const express = require("express");
const axios = require("axios");
const admin = require("firebase-admin");
const serviceAccount = require("./firebaseService/oihelper-firebase-adminsdk-pdkvc-eec93047f1.json");

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
    const snapshot = await db.ref("previousData").orderByChild("timestamp").limitToLast(5).once("value");
    const data = snapshot.val();
    const previousData = data ? Object.values(data) : [];

    res.json({ previousData });
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

    // Save the current underlyingValue and timestamp in Firebase Realtime Database
    // const timestamp = admin.database.ServerValue.TIMESTAMP;
    // await db.ref("previousData").push({ underlyingValue, timestamp });

    // Update cache with new data
    cachedData = underlyingValue;
    cacheExpiry = currentTime + cacheDuration;

    res.json({ underlyingValue });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data" });
  }

});


app.listen(port, () => console.log(`Oihelper app listening on port ${port}!`));
