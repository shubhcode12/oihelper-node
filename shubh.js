require("dotenv").config();
const express = require("express");
const admin = require("firebase-admin");
var sn = require("stocknotejsbridge");
var cron = require("node-cron");

// Load Firebase BASE64 Creds
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_CREDENTIALS_BASE64, "base64").toString()
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.DATABASE_URL,
});

const PORT = process.env.PORT || 3000;
const db = admin.database();
const app = express();
const bodyParser = require("body-parser");
app.use(bodyParser.json());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const EventEmitter = require("events");
const myEmitter = new EventEmitter();
const arr = [];

var logindata = {
  body: {
    userId: process.env.USERID,
    password: process.env.PASSWORD,
    yob: process.env.YOB,
  },
};

// const databaseFlush = (symbol)=>{
// db.ref(symbol).child("optionData").set({})
// db.ref(symbol).child("oiTrend").set({})
// db.ref(symbol).child("ceDividePe").set({})
// db.ref(symbol).child("peDivideCe").set({})
// db.ref(symbol).child("spotPriceGraph").set({})
// db.ref(symbol).child("totalOiCE").set({})
// db.ref(symbol).child("totalOiGraph").set({})
// db.ref(symbol).child("totalOiPE").set({})
// db.ref(symbol).child("volumeGraph").set({})
// }

// databaseFlush("NIFTY");



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
}

setSessionToken();

// Total OI Graph
const calculateOpenInterest = (data, type) =>
  data.reduce(
    (acc, obj) =>
      (type ? obj.optionType === type : true)
        ? acc + parseFloat(obj.openInterest || 0)
        : acc,
    0
  );

// OI Trend Graph
const calculateOiTrend = (totalCE, totalPE) => {
  return (totalPE - totalCE) / 1000000;
};

const saveToDB = async (symbol, ref, total) => {
  const currentTimestamp = Date.now();
  if (symbol !== null){
    await db.ref(symbol).child(ref).push({ timestamp: currentTimestamp, total }).then(()=>{
    console.log(`Data saved for symbol ${symbol}  || for reference ${ref}`)
  });
  }
};

// CPR Graph
const calculateCeDividePe = (totalCE, totalPE) => {
  if (totalPE === 0) return null;
  return totalCE / totalPE;
};

// PCR Graph
const calculatePeDivideCe = (totalCE, totalPE) => {
  if (totalCE === 0) return null;
  return totalPE / totalCE;
};

myEmitter.on("myEvent", async (i, totalOiSum, volumeSum, symbol) => {
  // console.time('time');

  await db.ref(symbol).child("optionData").push(i);

  const totalCE = calculateOpenInterest(i, "CE");
  const totalPE = calculateOpenInterest(i, "PE");

  saveToDB(symbol, "totalOiCE", totalCE);
  saveToDB(symbol, "totalOiPE", totalPE);

  // Save CPR Graph
  const ceDividePeValue = calculateCeDividePe(totalCE, totalPE);
  if (ceDividePeValue !== null) {
    saveToDB(symbol, "ceDividePe", ceDividePeValue);
  }

  // Save PCR Graph
  const peDivideCeValue = calculatePeDivideCe(totalCE, totalPE);
  if (peDivideCeValue !== null) {
    saveToDB(symbol, "peDivideCe", peDivideCeValue);
  }

  // Save OI Trend Graph
  const oiTrendValue = calculateOiTrend(totalCE, totalPE);
  if (oiTrendValue !== null) {
    saveToDB(symbol, "oiTrend", oiTrendValue);
  }

  // Save Total Volume Graph
  if (volumeSum !== null) {
    saveToDB(symbol, "volumeGraph", volumeSum);
  }

  // Save Total Oi Graph
  if (totalOiSum !== null) {
    saveToDB(symbol, "totalOiGraph", totalOiSum);
  }

  arr.length = 0;
  console.log("\n All option data added successfully");
  console.timeEnd("time");
});

// Nifty expiry is Thursday
function getNextThursday() {
  const now = new Date();
  let nextThursday = new Date(now);
  nextThursday.setDate(now.getDate() + ((11 - now.getDay()) % 7));
  return `${nextThursday.getFullYear()}-${String(
    nextThursday.getMonth() + 1
  ).padStart(2, "0")}-${String(nextThursday.getDate()).padStart(2, "0")}`;
}

// Banknifty expiry is Wednesday
function getNextWednesday() {
  const now = new Date();
  let nextWednesday = new Date(now);
  nextWednesday.setDate(now.getDate() + ((3 - now.getDay() + 7) % 7));
  return `${nextWednesday.getFullYear()}-${String(
    nextWednesday.getMonth() + 1
  ).padStart(2, "0")}-${String(nextWednesday.getDate()).padStart(2, "0")}`;
}

const expiryDateNifty = getNextThursday();
const expiryDateBankNifty = getNextWednesday();

const fetchAndSaveOptionChainData = async (option, symbol) => {
  let expiryDate;
  try {
    if (symbol === "NIFTY") {
      expiryDate = getNextThursday();
    } else if (symbol === "BANKNIFTY") {
      expiryDate = getNextWednesday();
    }

    const options = {
      expiryDate: expiryDate,
      optionType:
        option.type === "CE"
          ? sn.constants.OPTION_TYPE_CE
          : sn.constants.OPTION_TYPE_PE,
      strikePrice: option.strikePrice,
      exchange: sn.constants.EXCHANGE_NFO,
    };

    const optionChainData = await sn.snapi.optionchain(symbol, options);
    return JSON.parse(optionChainData) || 0;
  } catch (error) {
    console.error(
      `Error occurred for ${symbol || "Unknown Symbol"} ${option?.date} ${
        option?.strikePrice
      }:`,
      error
    );
  }
};


const processOptionData = async (symbol, allowedDays) => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  if (
    allowedDays.includes(dayOfWeek) &&
    currentTime >= 8 * 60 + 15 && // 9:15 am  9 * 60 + 15
    currentTime <= 15 * 60 + 30 // 3:30 pm  15 * 60 + 30
  ) {
    try {
      const strikesParamsRef = db.ref(symbol).child("strikesParams");
      const currentTimestamp = Date.now();
      strikesParamsRef.once("value").then((snapshot) => {
        const paramsData = snapshot.val();
        let totalOiSum = 0;
        let volumeSum = 0;
        let totalItems = 5;//paramsData.length;
        let completedItems = 0;
        let progressBarLength = 50;
        for (let i = 0; i < totalItems; i++) {
          setTimeout(async function () {
            const data = await fetchAndSaveOptionChainData(
              paramsData[i],
              symbol
            );
            const temp = data.optionChainDetails[0];
            const { bestBids, bestAsks, ...newobj } = temp;

            if (i === 0) {
              const spotPriceData = {
                timestamp: currentTimestamp,
                spotPrice: newobj.spotPrice,
              };
              db.ref(symbol).child("spotPriceGraph").push(spotPriceData);
            }

            arr.push(newobj);
            totalOiSum += parseFloat(newobj.openInterest);
            volumeSum += parseFloat(newobj.volume);

            completedItems++;

            displayProgressBar(completedItems, totalItems, progressBarLength);

            if (completedItems === totalItems) {
              myEmitter.emit("myEvent", arr, totalOiSum, volumeSum, symbol);
            }
          }, i * 500);
        }
        console.log("All option data added successfully");
      });
    } catch (error) {
      console.error("An error occurred:", error);
    }
  } else {
    console.log(`Not the right time to run the job for ${symbol}. Skipping...`);
  }
};

app.get("/nitish", (req, res) => {
  processOptionData("BANKNIFTY", [1, 2, 3, 4, 5, 6, 7]);
  res.send("calculation done")
});


function displayProgressBar(current, total, progressBarLength) {
  const progress = (current / total) * progressBarLength;
  const progressBar = `[${"=".repeat(progress)}${" ".repeat(
    progressBarLength - progress
  )}]`;
  process.stdout.write(`\r${current}/${total} ${progressBar}`);
} 


app.listen(process.env.PORT, () =>
  console.log(`Oihelper app listening on port ${process.env.PORT}!`)
);