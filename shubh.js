require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const sn = require('stocknotejsbridge');
const { createClient } = require('redis');
const appName = process.env.APP_NAME;
const client = createClient({
  url: process.env.REDIS_URL,
});

client.connect().then(() => {
  console.log('connected to redis');
});

const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_CREDENTIALS_BASE64, 'base64').toString());

admin.initializeApp({ credential: admin.credential.cert(serviceAccount), databaseURL: process.env.DATABASE_URL });

const PORT = process.env.PORT || 3000;
const db = admin.database();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const niftyExpiryArray = [
  '2023-12-07',
  '2023-12-14',
  '2023-12-21',
  '2023-12-28',
  '2024-01-04',
  '2024-01-11',
  '2024-01-18',
  '2024-01-25',
];
const bankniftyExpiryArray = [
  '2023-12-06',
  '2023-12-13',
  '2023-12-20',
  '2023-12-28',
  '2024-01-03',
  '2024-01-10',
  '2024-01-17',
  '2024-01-25',
];

const getNextExpiry = (datesArray) =>
  datesArray
    .filter(
      (date) =>
        date > new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]
    )
    .sort()[0] || null;

const getNextNiftyExpiry = () => getNextExpiry(niftyExpiryArray);
const getNextBankNiftyExpiry = () => getNextExpiry(bankniftyExpiryArray);

const EventEmitter = require('events');
const myEmitter = new EventEmitter();
const arr = [];

const displayProgressBar = (current, total, progressBarLength) => {
  const progress = (current / total) * progressBarLength;
  const progressBar = `[${'='.repeat(progress)}${' '.repeat(progressBarLength - progress)}]`;
  process.stdout.write(`\r${current}/${total} ${progressBar}`);
};

const logindata = {
  body: {
    userId: process.env.USERID,
    password: process.env.PASSWORD,
    yob: process.env.YOB,
  },
};

const databaseFlush = (symbol) => {
  const childPaths = [
    'optionData',
    'oiTrend',
    'ceDividePe',
    'peDivideCe',
    'spotPriceGraph',
    'totalOiCE',
    'totalOiGraph',
    'totalOiPE',
    'volumeGraph',
  ];

  childPaths.forEach((path) => {
    db.ref(symbol)
      .child(path)
      .set({}, (error) => {
        if (error) {
          console.error(`Error removing data at ${symbol}/${path}:`, error);
        } else {
          console.log(`Data at ${symbol}/${path} removed successfully.`);
        }
      });
  });
};

const getSessionToken = async () => {
  try {
    const cachedToken = await client.get('sessionToken' + appName);
    if (cachedToken) {
      return cachedToken;
    }

    const loginResponse = await sn.snapi.userLogin(logindata);
    const response = JSON.parse(loginResponse);
    const sessionToken = response['sessionToken'];
    await client.setEx('sessionToken' + appName, 12 * 60 * 60, sessionToken);
    return sessionToken;
  } catch (error) {
    console.error('Error in getSessionToken:', error);
    throw error;
  }
};

// Total OI Graph
const calculateOpenInterest = (data, type) =>
  data.reduce(
    (acc, obj) => ((type ? obj.optionType === type : true) ? acc + parseFloat(obj.openInterest || 0) : acc),
    0
  );

// OI Trend Graph
const calculateOiTrend = (totalCE, totalPE) => (totalPE - totalCE) / 1000000;

const saveToDB = async (symbol, ref, total) => {
  if (symbol !== null) {
    await db
      .ref(symbol)
      .child(ref)
      .push({ timestamp: Date.now(), total })
      .then(() => {
        console.log(`Data saved for symbol ${symbol}  || for reference ${ref}`);
      });
  }
};

// CPR Graph
const calculateCeDividePe = (totalCE, totalPE) => (totalPE === 0 ? null : totalCE / totalPE);

// PCR Graph
const calculatePeDivideCe = (totalCE, totalPE) => (totalCE === 0 ? null : totalPE / totalCE);

myEmitter.on('myEvent', async (i, totalOiSum, volumeSum, symbol) => {
  await db.ref(symbol).child('optionData').push(i);

  const totalCE = calculateOpenInterest(i, 'CE');
  const totalPE = calculateOpenInterest(i, 'PE');

  saveToDB(symbol, 'totalOiCE', totalCE);
  saveToDB(symbol, 'totalOiPE', totalPE);

  // Save CPR Graph
  const ceDividePeValue = calculateCeDividePe(totalCE, totalPE);
  if (ceDividePeValue !== null) saveToDB(symbol, 'ceDividePe', ceDividePeValue);

  // Save PCR Graph
  const peDivideCeValue = calculatePeDivideCe(totalCE, totalPE);
  if (peDivideCeValue !== null) saveToDB(symbol, 'peDivideCe', peDivideCeValue);

  // Save OI Trend Graph
  const oiTrendValue = calculateOiTrend(totalCE, totalPE);
  if (oiTrendValue !== null) saveToDB(symbol, 'oiTrend', oiTrendValue);

  // Save Total Volume Graph
  if (volumeSum !== null) saveToDB(symbol, 'volumeGraph', volumeSum);

  // Save Total Oi Graph
  if (totalOiSum !== null) saveToDB(symbol, 'totalOiGraph', totalOiSum);

  arr.length = 0;
  console.log('\n All option data added successfully');
});

const fetchAndSaveOptionChainData = async (option, symbol) => {
  try {
    const expiryDate =
      symbol === 'NIFTY' ? getNextNiftyExpiry() : symbol === 'BANKNIFTY' ? getNextBankNiftyExpiry() : null;

    if (!expiryDate) {
      console.error(`Invalid expiryDate for ${symbol}`);
      return null;
    }
    const options = {
      expiryDate: expiryDate,
      optionType: option.type === 'CE' ? 'CE' : 'PE',
      strikePrice: option.strikePrice,
      exchange: 'NFO',
    };

    const sessionToken = await getSessionToken();
    await sn.snapi.setSessionToken(sessionToken);
    const optionChainData = await sn.snapi.optionchain(symbol, options);

    if (optionChainData && typeof optionChainData === 'string') {
      // return JSON.parse(optionChainData);
      try {
        const data = JSON.parse(optionChainData);
        return data;
      } catch (error) {
        console.error(`Error parsing optionChainData for ${symbol} ${option?.date}`);
        return null;
      }
    } else {
      console.error(`Invalid optionChainData for ${symbol} ${option?.date} :`);
      return null;
    }
  } catch (error) {
    console.error(`Error occurred for ${symbol || 'Unknown Symbol'} ${option?.date}`, error);
    return null;
  }
};

const processOptionData = async (symbol, allowedDays) => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentTime = now.getHours() * 60 + now.getMinutes();
  const isCorrectTimeRange =
    allowedDays.includes(dayOfWeek) && currentTime >= 9 * 60 + 15 && currentTime <= 15 * 60 + 30;

  if (!isCorrectTimeRange) {
    console.log(`Not the right time to run the job for ${symbol}. Skipping...`);
    return;
  }

  try {
    const strikesParamsRef = db.ref(symbol).child('strikesParams');
    strikesParamsRef.once('value').then((snapshot) => {
      const paramsData = snapshot.val();
      let totalOiSum = 0;
      let volumeSum = 0;
      let totalItems = paramsData.length;
      let completedItems = 0;
      let progressBarLength = 50;
      for (let i = 0; i < totalItems; i++) {
        setTimeout(async () => {
          try {
            const data = await fetchAndSaveOptionChainData(paramsData[i], symbol);
            if (!(Array.isArray(data.optionChainDetails) && data.optionChainDetails.length > 0)) {
              console.warn(`No data available for ${symbol} ${paramsData[i].date}`);
              return;
            }
            const { bestBids, bestAsks, ...newobj } = data.optionChainDetails[0];
            if (i === 151) saveToDB(symbol, 'spotPriceGraph', newobj.spotPrice || 0);

            arr.push(newobj);
            totalOiSum += parseFloat(newobj.openInterest);
            volumeSum += parseFloat(newobj.volume);

            completedItems++;
            displayProgressBar(completedItems, totalItems, progressBarLength);

            if (completedItems === totalItems) myEmitter.emit('myEvent', arr, totalOiSum, volumeSum, symbol);
          } catch (error) {
            console.error(`Error occurred for ${symbol} ${paramsData[i].date}`, error);
          }
        }, i * 700);
      }
      console.log('All option data added successfully');
    });
  } catch (error) {
    console.error('An error occurred:', error);
  }
};

app.get('/nifty', async (req, res) => {
  await getSessionToken();
  processOptionData('NIFTY', [1, 2, 3, 4, 5, 6, 7]);
  res.send('calculation done');
});

app.get('/banknifty', async (req, res) => {
  await getSessionToken();
  processOptionData('BANKNIFTY', [1, 2, 3, 4, 5, 6, 7]);
  res.send('calculation done');
});

app.get('/dataflush', (req, res) => {
  databaseFlush('NIFTY');
  databaseFlush('BANKNIFTY');
  res.status(200).json({ message: 'Data flushed successfully.' });
});

getSessionToken().then((x) => {
  console.log('session token', x);
});

app.listen(PORT, () => console.log(`Oihelper ${appName} listening on port ${PORT}!`));
