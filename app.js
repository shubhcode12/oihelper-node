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
const spotPriceGraphRef = db.ref("spotPriceGraph")
const EventEmitter = require("events");
const { timeEnd, timeStamp } = require("console");
const myEmitter = new EventEmitter();
const arr = [];

const now = moment();
const dayOfWeek = now.day(); // 0 (Sunday) to 6 (Saturday)
const currentTime = now.format("HH:mm");
const currentTimestamp = Date.now();

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

const saveToDB = async (ref, total) =>
  await ref.push({ timestamp: currentTimestamp, total });

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

// Spot Price Graph & VIX Graph
const fetchIndexQuotes = async (symbol) => {
  try {
    const indexQuoteData = await sn.snapi.getIndexQuotes(symbol);
    const parsedData = JSON.parse(indexQuoteData);
    return parsedData.spotPrice;
  } catch (error) {
    console.error(`Error fetching index quotes for ${symbol}:`, error);
    return null;
  }
};

myEmitter.on("myEvent", async (i, sum, volumeData) => {
  // console.time('time');

  // const niftySpotPrice = await fetchIndexQuotes("NIFTY 50");
  // const indiaVixSpotPrice = await fetchIndexQuotes("INDIA VIX");

  // if (niftySpotPrice !== null && indiaVixSpotPrice !== null) {
  //   const timestamp = Date.now();
  //   const indexQuoteData = {
  //     NIFTY: niftySpotPrice,
  //     INDIA_VIX: indiaVixSpotPrice,
  //     timestamp: timestamp,
  //   };
  //   const vixGraphRef = db.ref("vixGraph");
  //   vixGraphRef.push(indexQuoteData);
  // } else {
  //   console.log("indexquote data not found");
  // }

  await optionDataRef.push(i);

  const totalCE = calculateOpenInterest(i, "CE");
  const totalPE = calculateOpenInterest(i, "PE");

  saveToDB(db.ref("totalOiCE"), totalCE);
  saveToDB(db.ref("totalOiPE"), totalPE);

  // Save CPR Graph
  const ceDividePeValue = calculateCeDividePe(totalCE, totalPE);
  if (ceDividePeValue !== null) {
    saveToDB(db.ref("ceDividePe"), ceDividePeValue);
  }

  // Save PCR Graph
  const peDivideCeValue = calculatePeDivideCe(totalCE, totalPE);
  if (peDivideCeValue !== null) {
    saveToDB(db.ref("peDivideCe"), peDivideCeValue);
  }

  // Save OI Trend Graph
  const oiTrendValue = calculateOiTrend(totalCE, totalPE);
  if (oiTrendValue !== null) {
    saveToDB(db.ref("oiTrend"), oiTrendValue);
  }else{
    console.log("oiTrend value is null")
  }

  // Save Total Volume Graph
  const totalVolumeGraphRef = db.ref("volumeGraph");
  totalVolumeGraphRef.push(volumeData);

  // Save Total Oi Graph
  const totalOiGraphRef = db.ref("totalOiGraph");
  totalOiGraphRef.push(sum).then(() => {
    console.log("Sum calculated and saved to the database");
  });
  arr.length = 0;
  console.log("\n All option data added successfully");
  console.timeEnd("time");
});

function displayProgressBar(current, total, progressBarLength) {
  const progress = (current / total) * progressBarLength;
  const progressBar = `[${"=".repeat(progress)}${" ".repeat(
    progressBarLength - progress
  )}]`;
  process.stdout.write(`\r${current}/${total} ${progressBar}`);
}

var corsOptions = {
  origin: "*",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  preflightContinue: false,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));

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

function getNextThursday() {
  const now = new Date();
  let nextThursday = new Date(now);
  nextThursday.setDate(now.getDate() + ((11 - now.getDay()) % 7));
  return `${nextThursday.getFullYear()}-${String(
    nextThursday.getMonth() + 1
  ).padStart(2, "0")}-${String(nextThursday.getDate()).padStart(2, "0")}`;
}

const expiryDate = getNextThursday();

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
    exchange: sn.constants.EXCHANGE_NFO,
  };

  sn.snapi
    .search("NIFTY", search)
    .then((data) => {
      console.log("Search result received");

      const response = JSON.parse(data);

      const niftyResults = response.searchResults.filter((item) =>
        item.tradingSymbol.startsWith("NIFTY")
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
const fetchAndSaveOptionChainData = async (option) => {
  let symbol;
  try {
    symbol = option.symbol === "NIFTY" ? "NIFTY" : "BANKNIFTY";

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
      `Error occurred for ${symbol || "Unknown Symbol"} ${option?.date} ${
        option?.strikePrice
      }:`,
      error
    );
  }
};
app.get("/spotdata", async (req, res) => {
  console.time("time");

  try {
    const septemberDataRef = db.ref("strikesParams");
    const snapshot = await septemberDataRef.once("value");
    const septemberData = snapshot.val();
    let sum = 0;
    let volumeSum = 0;
    let totalItems = 5; //septemberData.length;
    let completedItems = 0;
    let progressBarLength = 50;
    for (let i = 0; i < totalItems; i++) {
      setTimeout(async function () {
        const data = await fetchAndSaveOptionChainData(septemberData[i]);
        // console.log("🚀 ~ file: app.js:221 ~ data:", data);
        const temp = data.optionChainDetails[0];
        const { bestBids, bestAsks, ...newobj } = temp;

        arr.push(newobj);
        sum += parseFloat(newobj.openInterest);
        volumeSum += parseFloat(newobj.volume);

        completedItems++; // Increment the completed items

        // Update the progress bar
        displayProgressBar(completedItems, totalItems, progressBarLength);

        if (completedItems === totalItems) {
          const sumData = {
            timestamp: currentTimestamp,
            total: sum,
          };

          const volumeData = {
            timestamp: currentTimestamp,
            total: volumeSum,
          };

          myEmitter.emit("myEvent", arr, sumData, volumeData);

          // Send the response once all items are processed
          // res.send('All option data added successfully');
        }
      }, i * 500);
    }
    res.send("All option data added successfully");
  } catch (error) {
    console.error("An error occurred:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/addOIdata", async (req, res) => {
  var ref = db.ref("optionData");
  await ref.once("value", function (snapshot) {
    if (snapshot.exists) {
      var responce = snapshot.val();

      res.send(`${Object.keys(responce).length}`);
    } else {
      console.log("optiondata not exist");
      res.send("optiondata not exist");
    }
  });
});

function scheduleTask() {
  // Get the current date and time
  console.time("time");

  if (
    dayOfWeek >= 1 &&
    dayOfWeek <= 4 &&
    currentTime >= "09:15" &&
    currentTime <= "15:30"
  ) {
    try {
      const septemberDataRef = db.ref("strikesParams");
      septemberDataRef.once("value").then((snapshot) => {
        const septemberData = snapshot.val();
        let sum = 0;
        let volumeSum = 0;
        let totalItems = 5;//septemberData.length;
        let completedItems = 0;
        let progressBarLength = 50;
        for (let i = 0; i < totalItems; i++) {
          setTimeout(async function () {
            const data = await fetchAndSaveOptionChainData(septemberData[i]);
            const temp = data.optionChainDetails[0];
            const { bestBids, bestAsks, ...newobj } = temp;

            if (i === 0) {
              const spotPriceData = {
                timestamp: currentTimestamp,
                spotPrice: newobj.spotPrice,
              };
              spotPriceGraphRef.push(spotPriceData);
            }

            arr.push(newobj);
            sum += parseFloat(newobj.openInterest);
            volumeSum += parseFloat(newobj.volume);

            completedItems++;

            displayProgressBar(completedItems, totalItems, progressBarLength);

            if (completedItems === totalItems) {
              const sumData = {
                timestamp: currentTimestamp,
                total: sum,
              };

              const volumeData = {
                timestamp: currentTimestamp,
                total: volumeSum,
              };
              myEmitter.emit("myEvent", arr, sumData, volumeData);
            }
          }, i * 500);
        }
        console.log("All option data added successfully");
      });
    } catch (error) {
      console.error("An error occurred:", error);
    }
  } else {
    console.log("Not the right time to run the job. Skipping...");
  }

  setTimeout(scheduleTask, 5 * 60 * 1000);
}

scheduleTask();


function filterDataByDate(data, date) {
  return data.filter((item) => item.date === date);
}

app.get("/filterWeekData", async (req, res) => {
  try {
    strikesDataRef
      .once("value")
      .then((snapshot) => {
        const data = snapshot.val();
        const nextThursday = getNextThursday();
        const filteredData = filterDataByDate(data, nextThursday);

        console.log(JSON.stringify(filteredData, null, 2));
        strikesParamsRef.set(filteredData);
        res.json(filteredData);
      })
      .catch((error) => {
        console.error("Error fetching data:", error);
      });
  } catch (error) {
    console.error("Error fetching data:", error);
  }
});

app.get("/", (req, res) => {
  res.send("API Working fine");
});

app.listen(process.env.PORT, () =>
  console.log(`Oihelper app listening on port ${process.env.PORT}!`)
);
