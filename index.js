const express = require("express");
const axios = require("axios");
const admin = require("firebase-admin");
const serviceAccount = require("./firebaseService/oihelper-firebase-adminsdk-pdkvc-eec93047f1.json");
var sn = require("stocknotejsbridge");
require("dotenv").config();

const userId = process.env.USERID;
const password = process.env.PASSWORD;
const yob = process.env.YOB;
const dbUrl = process.env.DATABASE_URL;

// Initialize Firebase admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: dbUrl,
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

var logindata = {
  body: {
    userId: userId,
    password: password,
    yob: yob,
  },
};

async function setSessionToken() {
  try {
    const loginResponse = await sn.snapi.userLogin(logindata);
    const responce = JSON.parse(loginResponse);

    const sessionToken = responce["sessionToken"];
    sn.snapi.setSessionToken(sessionToken);
    console.log("Session Token set:", sessionToken);
  } catch (error) {
    console.error("Error setting Session Token:", error);
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

setSessionToken();

app.get("/optionchain", async (req, res) => {
  try {
    const symbol = req.body.symbol;

    const options = {
      expiryDate: "2023-09-28",
      optionType: sn.constants.OPTION_TYPE_PE,
      strikePrice: "3600",
      exchange: sn.constants.EXCHANGE_NFO,
    };

    const optionChainData = await sn.snapi.optionchain(symbol, options);
    res.send(optionChainData);
  } catch (error) {
    console.error("Error fetching Option Chain:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/indexquote", async (req, res) => {
  try {
    const index = req.body.index;

    const indexQuoteData = await sn.snapi.getIndexQuotes(index);
    res.send(indexQuoteData);
  } catch (error) {
    console.error("Error fetching Index Quote:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


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
