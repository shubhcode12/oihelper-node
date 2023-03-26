const express = require('express');
const tokenRoute = require('./routes/token')
const app = express();
const port = 3000
let accessToken = ""

const bodyParser = require('body-parser')
const cors = require("cors");
require('dotenv').config();

app.use(bodyParser.json());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", tokenRoute);

var corsOptions = {
    "origin": "*",
    "methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
    "preflightContinue": false,
    "optionsSuccessStatus": 204
}
app.use(cors(corsOptions));

app.get('/', (req, res) => {
    res.send('API Working fine');
});



app.listen(port, () => console.log(`Oihelper app listening on port ${port}!`))
