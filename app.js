require("dotenv").config();
const moment = require("moment");
const express = require("express");
const admin = require("firebase-admin");
var sn = require("stocknotejsbridge");
var cron = require("node-cron");
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
const cors = require("cors");
app.use(bodyParser.json());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const optionDataRef = db.ref("optionData");
const strikesDataRef = db.ref("strikesData");
const strikesParamsRef = db.ref("strikesParams");
const spotPriceGraphRef = db.ref("spotPriceGraph");
const EventEmitter = require("events");
const { timeEnd, timeStamp } = require("console");
const myEmitter = new EventEmitter();
const arr = [];

const now = moment();
const dayOfWeek = now.day(); // 0 (Sunday) to 6 (Saturday)
const currentTime = now.format("HH:mm");

var logindata = {
  body: {
    userId: process.env.USERID,
    password: process.env.PASSWORD,
    yob: process.env.YOB,
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
  if (symbol !== null) {
    await db
      .ref(symbol)
      .child(ref)
      .push({ timestamp: currentTimestamp, total })
      .then(() => {
        console.log(`Data saved for symbol ${symbol}  || for reference ${ref}`);
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
    return JSON.parse(optionChainData);
  } catch (error) {
    console.error(
      `Error occurred for ${symbol || "Unknown Symbol"} ${option?.date} ${option?.strikePrice
      }:`,
      error
    );
  }
};

function scheduleTask() {
  const processSymbol = async (symbol, allowedDays) => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    if (
      allowedDays.includes(dayOfWeek) &&
      currentTime >= 8 * 60 + 15 && // 9:15 am  9 * 60 + 15
      currentTime <= 23 * 60 + 30 // 3:30 pm  15 * 60 + 30
    ) {
      try {
        const strikesParamsRef = db.ref(symbol).child("strikesParams");
        const currentTimestamp = Date.now();
        strikesParamsRef.once("value").then((snapshot) => {
          const paramsData = snapshot.val();
          let totalOiSum = 0;
          let volumeSum = 0;
          let totalItems = paramsData.length;
          let completedItems = 0;
          let progressBarLength = 50;
          for (let i = 0; i < totalItems; i++) {
            setTimeout(async function () {
              const data = await fetchAndSaveOptionChainData(
                paramsData[i],
                symbol
              );

              let temp = {};
              if (Array.isArray(data.optionChainDetails) && data.optionChainDetails.length > 0) {
                temp = data.optionChainDetails[0];
              }

              const { bestBids, bestAsks, ...newobj } = temp;

              if (i === 30) {
                const spotPriceData = {
                  timestamp: currentTimestamp,
                  spotPrice: newobj.spotPrice || 0,
                };
                db.ref(symbol).child("spotPriceGraph").push(spotPriceData);
              }

              arr.push(newobj);
              totalOiSum += parseFloat(newobj.openInterest) || 0;
              volumeSum += parseFloat(newobj.volume) || 0;

              completedItems++;

              displayProgressBar(completedItems, totalItems, progressBarLength);

              if (completedItems === totalItems) {
                myEmitter.emit("myEvent", arr, totalOiSum, volumeSum, symbol);
              }
            }, i * 600);
          }
          console.log("All option data added successfully");
        });
      } catch (error) {
        console.error("An error occurred:", error);
      }
    } else {
      console.log(
        `Not the right time to run the job for ${symbol}. Skipping...`
      );
    }
  };

  // Process NIFTY from Monday to Thursday
  //processSymbol("NIFTY", [1, 2, 3, 4, 5, 6, 7]);

  // Process BANKNIFTY on Monday to Wednesday
  processSymbol("BANKNIFTY", [1, 2, 3, 4, 5, 6, 7]);

  setTimeout(scheduleTask, 5 * 60 * 1000);
}

scheduleTask();

function displayProgressBar(current, total, progressBarLength) {
  const progress = (current / total) * progressBarLength;
  const progressBar = `[${"=".repeat(progress)}${" ".repeat(
    progressBarLength - progress
  )}]`;
  process.stdout.write(`\r${current}/${total} ${progressBar}`);
}

app.get("/optionchain", async (req, res) => {
  try {
    const symbol = req.body.symbol;
    const expiryDate = req.body.expiryDate;
    const strikePrice = req.body.strikePrice;

    const options = {
      expiryDate: expiryDate,
      optionType: sn.constants.OPTION_TYPE_PE,
      strikePrice: strikePrice,
      exchange: sn.constants.EXCHANGE_NFO,
    };

    const optionChainData = await sn.snapi.optionchain(symbol, options);
    res.json(JSON.parse(optionChainData));
  } catch (error) {
    console.error("Error fetching Option Chain:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/indexquote", async (req, res) => {
  try {
    const getNiftyIndexQuote = await fetchIndexQuotes("INDIA VIX");
    const getVixIndexQuote = await fetchIndexQuotes("NIFTY 50");

    res.json({
      NIFTY: JSON.parse(getVixIndexQuote),
      INDIA_VIX: JSON.parse(getNiftyIndexQuote),
    });
  } catch (error) {
    console.error("Error fetching Index Quote:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/searchoptions", async (req, res) => {
  console.log("Endpoint accessed");
  var search = {
    exchange: [sn.constants.EXCHANGE_NFO, sn.constants.EXCHANGE_NFO_BANK],
  };

  sn.snapi
    .search("NIFTY", search)
    .then((data) => {
      console.log("Search result received");

      const response = JSON.parse(data);

      const niftyResults = response.searchResults.filter(
        (item) =>
          item.tradingSymbol.startsWith("NIFTY") ||
          item.tradingSymbol.startsWith("BANKNIFTY")
      );

      const monthMap = {
        JAN: "01",
        FEB: "02",
        MAR: "03",
        APR: "04",
        MAY: "05",
        JUN: "06",
        JUL: "07",
        AUG: "08",
        SEP: "09",
        OCT: "10",
        NOV: "11",
        DEC: "12",
      };

      const parsedData = niftyResults
        .map((item) => {
          const match = item.tradingSymbol.match(
            /^(\w+?)(\d{2})([A-Z]{3})(\d{2})(\d+)([CEPE]+)$/
          );

          if (match) {
            const day = match[2];
            const month = monthMap[match[3]];
            const year = "20" + match[4];
            const formattedDate = `${year}-${month}-${day}`;

            return {
              symbol: match[1],
              date: formattedDate,
              strikePrice: match[5],
              type: match[6],
            };
          }
          return null;
        })
        .filter((item) => item !== null);

      const collectionRef = db.ref("strikesData");
      collectionRef
        .set(parsedData)
        .then(() => {
          res.json({ "Data save to firebase : ": parsedData });
        })
        .catch((err) => {
          res.status(500).send("Unable to save data to firebase" + err);
        });
    })
    .catch((error) => {
      console.error("Error occurred: ", error);
      res.status(500).send("Internal Server Error");
    });
});

function filterDataByDateAndSymbol(data, date, symbol) {
  return data.filter((item) => item.date === date && item.symbol === symbol);
}

app.get("/filterData", async (req, res) => {
  try {
    const currentDate = new Date();
    const datesBankNifty = ["2023-12-06", "2023-12-13", "2023-12-20"];
    const datesNifty = ["2023-12-07", "2023-12-14"];
    const symbol = "BANKNIFTY";
    let targetDate;
    if (symbol === "BANKNIFTY") {
      // Find the next date for BANKNIFTY after the current date
      targetDate = datesBankNifty.find((date) => new Date(date) > currentDate);
    } else if (symbol === "NIFTY") {
      // Find the next date for NIFTY after the current date
      targetDate = datesNifty.find((date) => new Date(date) > currentDate);
    }

    if (!targetDate) {
      return res.status(404).send("No future date found for the given symbol");
    }

    strikesDataRef
      .once("value")
      .then((snapshot) => {
        const data = snapshot.val();

        const filteredData = filterDataByDateAndSymbol(
          data,
          targetDate,
          symbol
        );

        db.ref(symbol).child("strikesParams").set(filteredData);
        res.json(filteredData);
      })
      .catch((error) => {
        console.error("Error fetching data:", error);
        res.status(500).send("Error fetching data");
      });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).send("Error processing request");
  }
});

app.get("/", (req, res) => {
  res.send("API Working fine");
});

app.listen(process.env.PORT, () =>
  console.log(`Oihelper app listening on port ${process.env.PORT}!`)
);
