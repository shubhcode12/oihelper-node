const express = require("express");
const router = express.Router();
const {getAccessToken, printHelloCron} = require('../controller/token');


router.route("/access-token").post(getAccessToken);
router.route("/hello").get(printHelloCron);

module.exports = router;