const express = require("express");
const admin = require("firebase-admin");
const serviceAccount = require("./firebaseService/oihelper-firebase-adminsdk-pdkvc-eec93047f1.json");
var sn = require("stocknotejsbridge");
require("dotenv").config();

const userId = process.env.USERID;
const password = process.env.PASSWORD;
const yob = process.env.YOB;
const dbUrl = process.env.DATABASE_URL;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: dbUrl,
});

const app = express();
const port = 3000;

const bodyParser = require("body-parser");
const cors = require("cors");

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
    userId: "DS83807",
    password: "Ass#pass1",
    yob: "1999",
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
    const index = req.body.index;

    const indexQuoteData = await sn.snapi.getIndexQuotes(index);
    res.send(indexQuoteData);
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

            console.log("formated date " + formattedDate);
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

      console.log(parsedData);

      res.json(parsedData);
    })
    .catch((error) => {
      console.error("Error occurred: ", error);
      res.status(500).send("Internal Server Error");
    });
});

app.get("/", (req, res) => {
  res.send("API Working fine");
});

app.listen(port, () => console.log(`Oihelper app listening on port ${port}!`));
