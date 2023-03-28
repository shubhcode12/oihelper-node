var socket
const axios = require('axios');
require('dotenv').config();
let accessToken = ""

function handle_message(channel, message) {
    //handle incoming messages here
    console.log(`message: ${message} - received from channel ${channel} `)
}

function subscribe_to_channel(socket, ticker) {
    (async () => {

        // Subscribe to a channel.
        const channel_name = `${ticker}`
        console.log(`subscribing to channel ${channel_name}`)
        let myChannel = socket.subscribe(channel_name);

        await myChannel.listener('subscribe').once();
        // myChannel.state is now 'subscribed'.
        //console.log(`successfully subscribed to channel ${JSON.stringify(myChannel)}`);


        //now, i need listener for the channel i subscribed to.
        //
        (async () => {
            for await (let data of myChannel) {
                // log channel name, and the data to console
                console.log(`channel data received: ${data} - from channel ${ticker}.json`);
                handle_message("SUBSCRIPTION-" + channel_name, data)
            }
        })();
    })();
}

async function runTokenJob() {
    const loginId = process.env.loginId
    const product = process.env.product
    const apikey = process.env.apikey


    const authEndPoint = `http://s3.vbiz.in/directrt/gettoken?loginid=${loginId}&product=${product}&apikey=${apikey}`


    axios
        .get(authEndPoint)
        .then(function (res) {
            console.log(`statusCode: ${res.status}`)

            if (res.status == 200) {
                //check the payload, for authentication status returned. exit if not authenticated.
    const loginId = process.env.loginId
    const product = process.env.product

                console.log("Response : " + JSON.stringify(res.data));

                if (res.data.hasOwnProperty('Status') == false) {
                    console.log('authentication status not returned in payload. exiting')
                    return
                } else {
                    // console.log(`Auth Response ${res.data}`);
                }

                if (res.data.hasOwnProperty('AccessToken') == false) {
                    console.log('access token not returned in payload. exiting')
                    return
                }

                var max_symbol = res.data['MaxSymbol']
                var access_token = res.data['AccessToken']
                var is_authenticated = res.data['Status']
                if (is_authenticated == false) {
                    console.log('authentication NOT successful,exiting')
                    return
                }

                //access token returned
                console.log('access token: ', access_token)
                accessToken = access_token;

                console.log('CSV Headerrs: ', res.data["Message"]);

                console.log('connecting to websocket...')
                var wsEndPoint = `116.202.165.216:992/directrt/?loginid=${loginId}&accesstoken=${access_token}&product=${product}`
                //console.log('final websocket url: ',wsEndPoint)
                //
                const socketClusterClient = require('socketcluster-client')
                socket = socketClusterClient.create({
                    hostname: wsEndPoint,
                    path: '',
                    port: 80
                });

                //get the CSV header details
                // subscribe_to_events(socket, 'getcsvdataheader')
                // socket.transmit('getcsvdataheader', '')


                //set a timeout, to let us know when the websocket connection is open
                var myInterval = setInterval(function () {
                    console.log('websocket connection state: ', socket.state);
                    if (socket.state == 'open') {
                        //console.log(socket)
                        console.log('websocket connection is open')

                        //cancel interval
                        clearInterval(myInterval);

                        // DIRECTRT PRIME USERS NEED TO SUBSCRIBE TO TICKDATA. ALL MARKET UPDATES ARE SENT TO THIS EVENT
                        // .json - to receive 1 min data in JSON format.
                        // .csv - to receive 1 min data in CSV format.
                        // .tick - to receive 1 sec data in CSV format. This is volume adjusted for each second.
                        // .raw - to received 1 sec data in RAW Exchange format. This will not have Volume per second.
                        // subscribe_to_channel(socket, 'NSE_FUTIDX_NIFTY_26MAY2022.csv')
                        // subscribe_to_channel(socket, 'NSE_FUTIDX_NIFTY_26MAY2022.json')
                        subscribe_to_channel(socket, 'NSE_OPTIDX_NIFTY_30MAR2023_18500CE.ocn.json')

                    } else if (socket.state == 'closed') {
                        console.log(socket);
                        console.log('websocket connection is closed. exiting');
                        clearInterval(myInterval);
                        // socket.disconnect();
                        return
                    }
                }, 1000)

            } else {
                //error occured getting access token
                console.log(`server-side error occurred when getting access token,status code returned was ${res.status}\r\nResponse : ${json.stringify(res)}`);
                return
            }
        })
        .catch(error => {
            console.error(`Exception occured: ${error}`);
            return
        })

}

runTokenJob()


const refreshAccessToken = async (req, res) => {
    const mySecret = process.env.MYCUSTOMSECRET;

    if (mySecret != req.body.secret) {
        res.status(400).json({
            message: "provide valid secret key"
        })
    }

    runTokenJob().then((result) => {
        const cDate = new Date().toLocaleString();
        res.status(200)
            .json({ message: "new access token generated at " + cDate });

    }).catch(err => {
        res.status(500).json({
            error: err,
            message: "failed to generate new access token"
        })
    });

}

const getAccessToken = async (req, res) => {

    res.json({
        token : accessToken
    })

    // const mySecret = process.env.MYCUSTOMSECRET;

    // if (!req.body.secret) {
    //     res.json({
    //         message: "secret is not provided"
    //     })
    // }

    // if (mySecret == req.body.secret) {
    //     res.status(200).json({
    //         token: accessToken
    //     })
    // } else {
    //     res.status(400).json({
    //         message: "something went wrong"
    //     })
    // }
}





const printHelloCron = async (req, res) => {
    // example cron job function
    const r = Math.random();
    res.send(`hello cron : ${r}`)
}

module.exports = { getAccessToken, printHelloCron, refreshAccessToken };