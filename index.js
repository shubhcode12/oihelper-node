const express = require("express");
const admin = require("firebase-admin");
const serviceAccount = require("./firebaseService/oihelper-firebase-adminsdk-pdkvc-eec93047f1.json");

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

app.get("/spotchart", async (req, res) => {
  try {
    const currentTime = new Date();
    const marketStartTime = new Date();
    marketStartTime.setHours(9, 0, 0); // Set market start time to 9 am
    const marketEndTime = new Date();
    marketEndTime.setHours(15, 30, 0); // Set market end time to 3:30 pm

    // if (currentTime < marketStartTime || currentTime > marketEndTime) {
    //   // Market is closed, fetch previous data and delete it
    //   const snapshot = await db.ref("previousData").once("value");
    //   const previousData = snapshot.val();

    //   await db.ref("previousData").remove();

    //   res.json({ underlyingValue: previousData?.underlyingValue || null });
    //   return;
    // }

    const response = await fetch(
      "https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY"
    );
    const data = await response.json();
    const underlyingValue = data?.records?.underlyingValue;

    // Save the current underlyingValue and timestamp in Firebase Realtime Database
    const timestamp = admin.database.ServerValue.TIMESTAMP;
    await db.ref("previousData").set({ underlyingValue, timestamp });

    res.json({ underlyingValue });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.listen(port, () => console.log(`Oihelper app listening on port ${port}!`));
