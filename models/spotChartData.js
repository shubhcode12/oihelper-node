const mongoose = require("mongoose");

const SpotChartDataSchema = new mongoose.Schema({
  underlyingValue: {
    type: Number,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const SpotChartData = mongoose.model("SpotChartData", SpotChartDataSchema);

module.exports = SpotChartData;