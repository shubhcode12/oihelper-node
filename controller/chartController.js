const admin = require("firebase-admin");
const cron = require("node-cron");
const fetch = require("isomorphic-fetch");

// Initialize Firebase app (only needed for Realtime Database access)
const serviceAccount = require("../firebaseService/oihelper-firebase-adminsdk-pdkvc-eec93047f1.json");
const firebaseConfig = {
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://oihelper-default-rtdb.firebaseio.com",
};
admin.initializeApp(firebaseConfig);

// Get the Realtime Database instance
const database = admin.database();

async function getSpotChartData(req, res) {
  try {
    // const currentTime = new Date();
    // const marketStartTime = new Date();
    // marketStartTime.setHours(9, 0, 0); // Set market start time to 9 am
    // const marketEndTime = new Date();
    // marketEndTime.setHours(15, 0, 0); // Set market end time to 3 pm

    // if (currentTime < marketStartTime || currentTime > marketEndTime) {
    //   // Market is closed, fetch previous data and delete it
    //   const previousDataSnapshot = await database
    //     .ref("spotChartData")
    //     .orderByChild("timestamp")
    //     .limitToLast(1)
    //     .once("value");
    //   const previousData = previousDataSnapshot.val();

    //   await database.ref("spotChartData").remove();

    //   res.json({ underlyingValue: previousData[0].underlyingValue });
    //   return;
    // }

    const response = await fetch(
      "https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY"
    );
    const data = await response.json();
    const underlyingValue = data.records.underlyingValue;

    // Save the current underlyingValue in the database
    // const timestamp = admin.database.ServerValue.TIMESTAMP;
    // const spotChartDataRef = database.ref("spotChartData").push();
    // await spotChartDataRef.set({ underlyingValue, timestamp });

    res.json({ underlyingValue });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data" + error });
  }
}

async function getPrevSpotChartData(req, res) {
  try {
    const previousDataSnapshot = await database
      .ref("spotChartData")
      .orderByChild("timestamp")
      .limitToLast(1)
      .once("value");
    const previousData = previousDataSnapshot.val();

    if (previousData) {
      const keys = Object.keys(previousData);
      const latestDataKey = keys[0];
      const latestData = previousData[latestDataKey];
      res.json({ underlyingValue: latestData.underlyingValue });
    } else {
      res.json({ underlyingValue: null });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch previous data" + error });
  }
}

// Schedule deletion of underlyingValue data every day at 3:30 am
cron.schedule("0 3 * * *", async () => {
  try {
    await database.ref("spotChartData").remove();
    console.log("UnderlyingValue data deleted from Firebase Realtime Database");
  } catch (error) {
    console.error(
      "Failed to delete underlyingValue data from Firebase Realtime Database",
      error
    );
  }
});

module.exports = {
  getSpotChartData,
  getPrevSpotChartData,
};
