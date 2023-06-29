const SpotChartData = require("../models/spotChartData");
const cron = require("node-cron");


async function getSpotChartData(req, res) {
  try {
    const currentTime = new Date();
    const marketStartTime = new Date();
    marketStartTime.setHours(9, 0, 0); // Set market start time to 9 am
    const marketEndTime = new Date();
    marketEndTime.setHours(15, 0, 0); // Set market end time to 3 pm

    if (currentTime < marketStartTime || currentTime > marketEndTime) {
      // Market is closed, fetch previous data and delete it
      const previousData = await SpotChartData.find()
        .sort({ timestamp: -1 })
        .limit(1)
        .lean();
        
      await SpotChartData.deleteMany();

      res.json({ underlyingValue: previousData[0].underlyingValue });
      return;
    }

    const response = await fetch(
      "https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY"
    );
    const data = await response.json();
    const underlyingValue = data.records.underlyingValue;

    

    // Save the current underlyingValue in the database
    const spotChartData = new SpotChartData({ underlyingValue });
    await spotChartData.save();

    res.json({ underlyingValue });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data" + error });
  }
}

// Schedule deletion of underlyingValue data every day at 3:30 am
cron.schedule("0 3 * * *", async () => {
  try {
    await SpotChartData.deleteMany();
    console.log("UnderlyingValue data deleted from MongoDB");
  } catch (error) {
    console.error("Failed to delete underlyingValue data from MongoDB", error);
  }
});

module.exports = {
  getSpotChartData,
};
