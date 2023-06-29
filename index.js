const express = require("express");
const chartRoute = require("./routes/chartRoute");
const mongoose = require("mongoose");
const app = express();
const port = 3000;

// Connect to MongoDB
mongoose.connect("mongodb+srv://shubhcodedev:MYQefezLPhCpjkbT@cluster1.eyydig6.mongodb.net/", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => {
  console.log("Connected to MongoDB successfully!");
});

const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();

app.use(bodyParser.json());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", chartRoute);

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
    let symbolParam = req.query;
    const response = await fetch("https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY");
    const data = await response.json();
    const underlyingValue = data.records.underlyingValue;

    res.json({ underlyingValue });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.listen(port, () => console.log(`Oihelper app listening on port ${port}!`));
