const express = require('express');
const app = express();
const port = 3000



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
                //   console.log(`channel data received: ${data} - from channel ${ticker}.json`);
                handle_message("SUBSCRIPTION-" + channel_name, data)
            }
        })();
    })();
}

function subscribe_to_events(socket, event) {
    (async () => {

        // Subscribe to a Event.
        const channel_name = `${event}`
        console.log(`subscribing to Event ${channel_name}`)
        try {
            (async () => {
                for await (let data of socket.receiver(event)) {
                    handle_message(event, data)
                }
            })();
        } catch (error) {
            console.log(json.stringify(error));
        }
    })();
}

function unsubscribe_from_channel(socket, ticker) {
    (async () => {
        // unSubscribe to a channel.
        const channel_name = `${ticker}.json`
        console.log(`unsubscribing from channel ${channel_name}`)
        let myChannel = socket.unsubscribe(channel_name);

        //await myChannel.listener('unsubscribe').once();
        // myChannel.state is now 'unsubscribed'.
        console.log(`successfully unsubscribed from channel ${JSON.stringify(channel_name)}`);
    })();
}

function disconnect_websocket(socket) {
    socket.disconnect()
    console.log('disconnected the websocket connection.')
}


function download_ticker() {
    //download tickers
    console.log('downloading tickers...');
    //var fs = require('fs');
    reqEndPoint = "http://qbase1.vbiz.in/directrt/";
    url = `http://qbase1.vbiz.in/directrt/gettickers?loginid=${loginId}&product=${product}&accesstoken=${access_token}`;
    axios.get(url).then(function (res) {
        if (!res.status == 200) {
            //error occured getting the tickers
            console.log('Error occured getting tickers - response status code not 200', res.status)
            return
        } else {
            //confirm that payload is not an error response.
            if (res.data.includes('Invalid session. Relogin to continue')) {
                //error response returned
                console.log('Error occured downloading tickers[invalid session]: ', res.data)
                return
            }
            if (res.data.includes('Invalid access token')) {
                //invalid access token 
                console.log('Error occured downloading tickers[invalid access token]: ', res.data)
                return
            }
        }

        //save the content (tickers) to file
        fs.writeFile('tickers.txt', res.data, function (err) {
            if (err) {
                console.log(`Error writing the downloaded tickers to file: ${err} - no websocket connection will be made.`);
                return
            } else {
                console.log('successfully written the tickers to file.');
            }
        });
    })
}

function read_tickers_from_file() {
    fs.readFile('tickers.txt', function (err, data) {
        if (err) {
            console.log(`Error reading tickers from file tickers.txt: ${err} - no websocket connection will be made`);
            return
        } else {
            console.log('tickers read from file successful');
        }

        //console.log(data.toString());
        var tickers = data.toString().split(',');
    })
}

async function main() {

    loginId = 'DC-PRAN5581'; // use your login ID.
    product = 'DIRECTRTLITE';
    apikey = '713A0855358649B795CD'; // use your API Key

    const authEndPoint = `http://s3.vbiz.in/directrt/gettoken?loginid=${loginId}&product=${product}&apikey=${apikey}`
    let accessToken = ""

    axios
        .get(authEndPoint)
        .then(function (res) {
            console.log(`statusCode: ${res.status}`)

            if (res.status == 200) {
                //check the payload, for authentication status returned. exit if not authenticated.

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
                app.post("/access-token", (req, res) => {
                    mySecret = process.env.MYCUSTOMSECRET                   

                    if(!req.body.secret){
                        res.json({
                            message : "secret is not provided"
                        })
                    }

                    if(mySecret == req.body.secret){
                        res.status(200).json({
                            token : accessToken
                        })
                    }else{
                        res.status(200).json({
                            message : "provide valid secret key"
                        })
                    }

                })
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




//#########################################################
//START
//#########################################################

/* 
call main function, which will authenticate,download tickers and subscribe to the channels(demo mode).
comment out the code that subscribes to channels in main function. the main function will therefore only make the websocket connection only
 you can then subscribe to channels you want, by calling the subscribe function above
to unsubscribe from a channel, call the unsubscribe function
to close the websocket connection, call the disconnect function above. 
*/

var socket
var fs = require('fs');
const axios = require('axios');
const cors = require("cors");
require('dotenv').config();
const paypal = require("paypal-rest-sdk");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

loginId = process.env.loginId
product = process.env.product
apikey = process.env.apikey
main()



app.listen(port, () => console.log(`Oihelper app listening on port ${port}!`))
