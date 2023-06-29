const express = require("express");
const router = express.Router();
const spotChartController = require("../controller/chartController");


router.get("/spotchart", spotChartController.getSpotChartData);


module.exports = router;