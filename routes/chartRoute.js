const express = require("express");
const router = express.Router();
const {getSpotChartData, getPrevSpotChartData} = require("../controller/chartController");


router.get("/spotchart", getSpotChartData);

router.get("/spotchart/previous", getPrevSpotChartData);


module.exports = router;