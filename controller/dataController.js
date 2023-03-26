var fs = require('fs');
var socket

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