var express = require('express');
var router = express.Router();
var firebase = require('firebase');
const functions = require('firebase-functions');
// The Firebase Admin SDK to access the Firebase Realtime Database. 
const admin = require('firebase-admin');
// CORS Express middleware to enable CORS Requests.
const cors = require('cors')({ origin: true });
const cookieParser = require('cookie-parser')();

admin.initializeApp(functions.config().firebase);

// Get the Database service for the default app


firebase.initializeApp({
    apiKey: "AIzaSyDUAyjvms6r6CWiy2C3BX_HH1mqzuoz-YI",
    authDomain: "cgihunt.firebaseapp.com",
    databaseURL: "https://cgihunt.firebaseio.com",
    projectId: "cgihunt",
    storageBucket: "cgihunt.appspot.com",
    messagingSenderId: "415988983785"
});

var defaultDatabase = firebase.database();

// Get the Auth service for the default app

// Express middleware that validates Firebase ID Tokens passed in the Authorization HTTP header.
// The Firebase ID token needs to be passed as a Bearer token in the Authorization HTTP header like this:
// `Authorization: Bearer <Firebase ID Token>`.
// when decoded successfully, the ID Token content will be added as `req.user`.
const validateFirebaseIdToken = (req, res, next) => {
    console.log('Check if request is authorized with Firebase ID token');

    if ((!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) &&
        !(req.cookies && req.cookies.__session)) {
        console.error('No Firebase ID token was passed as a Bearer token in the Authorization header.',
            'Make sure you authorize your request by providing the following HTTP header:',
            'Authorization: Bearer <Firebase ID Token>',
            'or by passing a "__session" cookie.');
        res.status(403).send('Unauthorized');
        return;
    }

    let idToken;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        console.log('Found "Authorization" header');
        // Read the ID Token from the Authorization header.
        idToken = req.headers.authorization.split('Bearer ')[1];
        console.log('id: ' + idToken);
    } else if (req.cookies) {
        console.log('Found "__session" cookie');
        // Read the ID Token from cookie.
        idToken = req.cookies.__session;
    } else {
        // No cookie
        res.status(403).send('Unauthorized');
        return;
    }

    admin.auth().verifyIdToken(idToken).then((decodedIdToken) => {
        console.log('ID Token correctly decoded', decodedIdToken);
        req.user = decodedIdToken;
        return next();
    }).catch((error) => {
        console.error('token: ' + idToken);
        console.error('Error while verifying Firebase ID token:', error);
        res.status(403).send('Unauthorized');
    });
};

router.use(cors);
router.use(cookieParser);
// router.use(validateFirebaseIdToken);
/* GET users listing. */
router.get('/demo/:long/:lat', (req, res, next) => {
    //console.log('token: ' + JSON.stringify(req.user));
    //    var currentUser = req.user.user_id;
    //  console.log('readdb -> user: ' + currentUser);
    var longitude = req.params.long;
    var latitude = req.params.lat;

    res.send({ lat: 50.2, long: 30.6, niete: false });

});

/////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////

const RETVALUES = 3;

router.use(cors);
router.use(cookieParser);
// router.use(validateFirebaseIdToken);
router.get('/nextpoints/:long/:lat/:userid', (req, res, next) => {
    var longitude = req.params.long;
    var latitude = req.params.lat;
    var userid = req.params.userid;

    admin.database().ref('/users/' + userid).once('value').then((snapshot) => {
        var elements = snapshot.val();
        for (let index = 0; index < elements.length; index++) {
            var element = elements[index];
            const distance = calcDistance(latitude, longitude, element.lat, element.lon, 'K');
            element.distance = distance;
            elements[index] = element;
            console.log('');
        }
        elements.sort((a, b) => {
            return a.distance - b.distance;
        });
        // mupltiple calls reduces the array of marks - this must be avoided, if
        // distance is > 0 for first element in array
        var slicer = 1;
        if (elements[0].distance > 0) {
            slicer = 0;
        }
        if ( resultHasOnlyNieten(elements,slicer)) {
            let notNiete = Math.floor(Math.random()*RETVALUES)+slicer;
            elements[notNiete].niete = false;
            console.log('no niete new: ' + notNiete);
        }
        // save 
        admin.database().ref('/users/' + userid).set(elements.slice(slicer)).then(() => {
            res.status(200);
            res.send(JSON.stringify(elements.slice(slicer, RETVALUES + slicer)));
            return;
        }).catch((err) => {
            console.error('error: ' + err);
            res.status(500);
            res.send({ "status": "error" });
        });
    });

})


router.use(cors);
router.use(cookieParser);
// router.use(validateFirebaseIdTok
router.get('/startingpoint/:long/:lat/:userid', (req, res, next) => {
    var longitude = req.params.long
    var latitude = req.params.lat;
    var userid = req.params.userid;

    admin.database().ref('/marks').once('value').then((snapshot) => {
        var minimum = -1;
        var resobj = {};
        var minimumId = -1;
        elements = snapshot.val();
        for (let index = 0; index < elements.length; index++) {
            var element = elements[index];
            var lat = element.lat; var lon = element.lon;
            distance = calcDistance(latitude, longitude, lat, lon, 'K');
            if (minimum === -1 || distance < minimum) {
                minimum = distance;
                resobj = element;
                minimumId = index;
                console.log('minimum new: ' + JSON.stringify(resobj) + 'minimum: ' + minimum);
            }
            element.visited = false;
            element.niete = true;
            element.distance = distance;
            elements[index] = element;
        }
        elements[minimumId].niete = false;
        // save 
        admin.database().ref('/users/' + userid).set(elements).then(() => {
            res.status(200);
            res.send(JSON.stringify(resobj));
            return;
        }).catch((err) => {
            console.log('error: ' + err);
            res.status(500);
            res.send({ "status": "error" });
        });
    }).catch((err) => {
        res.status(200);
        res.send('hups... error: ' + err);
    });
});

///////////////////////////////////////////////////////////////////////////////
// RETVALUES
function resultHasOnlyNieten ( elements, startWith ) {
    for ( index = 0+startWith; index < RETVALUES+startWith; index++ ) {
        if ( elements[index].niete === false ) {
            return false;
        }
    }
    return true;
}

function calcDistance(lat1, lon1, lat2, lon2, unit) {
    var radlat1 = Math.PI * lat1 / 180
    var radlat2 = Math.PI * lat2 / 180
    var theta = lon1 - lon2
    var radtheta = Math.PI * theta / 180
    var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
    dist = Math.acos(dist)
    dist = dist * 180 / Math.PI
    dist = dist * 60 * 1.1515
    if (unit == "K") { dist = dist * 1.609344 }
    if (unit == "N") { dist = dist * 0.8684 }
    if ( dist < 0.001) {
        dist = 0;
    }
    return dist
}

////////////////////////////////////////////////////////////////////////////////
// for testing

router.get('/helloworld', (req, res, next) => {
    res.send('hello world');
});

module.exports = router;