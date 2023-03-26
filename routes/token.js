const express = require("express");
const router = express.Router();
const {getAccessToken, printHelloCron, refreshAccessToken} = require('../controller/token');


router.route("/access-token").post(getAccessToken);
router.route("/refresh-access-token").post(refreshAccessToken);
router.route("/hello").get(printHelloCron);

module.exports = router;