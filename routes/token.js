const express = require("express");
const router = express.Router();
const {getAccessToken} = require('../controller/token');


router.route("/access-token").post(getAccessToken);

module.exports = router;