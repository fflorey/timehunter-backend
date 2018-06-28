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
    apiKey: 'AIzaSyDUAyjvms6r6CWiy2C3BX_HH1mqzuoz-YI',
    authDomain: 'cgihunt.firebaseapp.com',
    databaseURL: 'https://cgihunt.firebaseio.com',
    projectId: 'cgihunt',
    storageBucket: 'cgihunt.appspot.com',
    messagingSenderId: '415988983785'
});

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
        var elements = purgeElements ( snapshot.val() );
        // update distance field
        elements = elements.map ( e => { e.distance =  calcDistance(latitude, longitude, e.lat, e.lon, 'K'); return e; } );
        elements.sort((a, b) => { return a.distance - b.distance; });
        markElementsForPurge ( elements );
        if (resultHasOnlyNieten(elements)) {
            let notNiete = Math.floor(Math.random() * RETVALUES);
            elements[notNiete].niete = false;
        }
        return saveElementsForUser(userid, elements, 0, RETVALUES);
    }).then(result => {
        res.status(200);
        res.send(result);
    }).catch((err) => {
        console.error(err);
        res.status(500);
        res.send(errMessage(err));
    });
});


router.use(cors);
router.use(cookieParser);
// router.use(validateFirebaseIdTok
router.post('/writeplayzone/:long/:lat/:name/:userid', (req, res, next) => {
    var longitude = req.params.long;
    var latitude = req.params.lat;
    var userid = req.params.userid;
    var name = req.params.name;
    const body = req.body;
    console.log('aha: ' + JSON.stringify(body));
    let newMap = body;
    if (  ! Array.isArray(newMap) ) {
        res.status(500);
        res.send(errMessage('error # body must be an  array'));
        return;
    }
    storeNewPlayzone ( userid, name, longitude, latitude, newMap ).then (result => {
        console.log('result: ' + result);
        res.status(200);
        res.send(result);
    }).catch( err => {
        console.error('error: ' + err);
        res.status(500);
        res.send(err);
    });
});

router.use(cors);
router.use(cookieParser);
// router.use(validateFirebaseIdTok
router.get('/getzoneinfos/:long/:lat/:range/:userid', (req, res, next) => {
    const longitude = req.params.long;
    const latitude = req.params.lat;
    const range = req.params.range;
    const userid = req.params.userid;

    getZones(longitude,latitude,range).then (result => {        
        res.status(200).send(result);
    }).catch( err => {
        console.log('error!');
        res.status(500).send(err);
    });
});



router.use(cors);
router.use(cookieParser);
// router.use(validateFirebaseIdTok
router.post('/createnewplayzone/:long/:lat/:name/:userid', (req, res, next) => {
    var longitude = req.params.long;
    var latitude = req.params.lat;
    var userid = req.params.userid;
    var name = req.params.name;
    const body = req.body;
    let newMap = body;
    if (  ! Array.isArray(newMap) ) {
        res.status(500);
        res.send(errMessage('error # body must be an  array'));
        return;
    }
    isMapNameAvailable(name).then( result => {
        if ( result === true ) {
            return storeNewPlayzone ( userid, name, longitude, latitude, newMap );
        } else {
            throw 'error # name allready taken (use writeplayzone to overwrite)';
        }
    }).then (result => {
        console.log('result: ' + result);
        res.status(200);
        res.send(result);
    }).catch( err => {
        console.error('error: ' + err);
        res.status(500);
        res.send(err);
    });
});

router.use(cors);
router.use(cookieParser);
// router.use(validateFirebaseIdTok
router.get('/startingpoint/:long/:lat/:fieldname/:userid', (req, res, next) => {
    var longitude = req.params.long;
    var latitude = req.params.lat;
    var fieldname = req.params.fieldname;
    var userid = req.params.userid;
    getMapOfZone (fieldname).then ( snapshot =>  {
        var elements = reduceMarksOnField ( snapshot.val() );
        // add fields
        elements = elements.map ( e => { e.visited =  false; e.niete = true; e.purge = false; 
            e.distance =  calcDistance(latitude, longitude, e.lat, e.lon, 'K'); return e; } );
        elements.sort((a, b) => { return a.distance - b.distance; });
        elements[0].niete = false;
        elements[0].purge = true;
        return saveElementsForUser(userid, elements, 0, 1);
    }).then((result) => {
        res.status(200);
        res.send(JSON.stringify(result[0]));
        return;
    }).catch((err) => {
        console.error('Error' + err);
        res.status(500);
        res.send(errMessage(err));
    });
});

///////////////////////////////////////////////////////////////////////////////

function getZones ( longitude, latitude, range ) {
    return new Promise( (resolve, reject) => {
        admin.database().ref('/zones/').once('value').then((snapshot) => {
            var result = [];
            const allfields = snapshot.val();
            for (const key in allfields) {
                if (allfields.hasOwnProperty(key)) {
                    const element = allfields[key];
                    const distance = calcDistance(latitude,longitude,element.latitude,element.longitude, 'K');
                    if ( distance <= range )  {
                        result.push({ name: element.name, distance: distance });
                    }
                }
            }
            return resolve(result);
        }).catch ( err => {
            return reject(errMessage(err));
        });
    });    
}

function getMapOfZone ( name ) {
    return new Promise( (resolve, reject) => {
        admin.database().ref('/zones/' +name+'/map').once('value').then((snapshot) => {
            var result = snapshot.val();
            if ( result == undefined || result == null ) {
                return reject('error # no data for zone "'+name+'" found.');
            }
            return resolve(snapshot);
        }).catch ( err => {
            return reject(errMessage(err));
        });
    });    
}

function storeNewPlayzone ( userid, name, longitude, latitude, newMap ) {
    return new Promise( (resolve, reject) => {
        let zone = {};
        zone.name = name;
        zone.longitude = longitude;
        zone.latitude = latitude;
        zone.userid = userid;
        zone.map = newMap;
        admin.database().ref('/zones/'+name).set(zone).then((result) => {
            return resolve(true);
        }).catch ( (err) => {
            console.error('error: ' + err);
            return reject(err);
        });
    });    
}

function isMapNameAvailable ( name ) {
    return new Promise( (resolve, reject) => {
        admin.database().ref('/zones/'+name).once('value').then((snapshot) => {
            console.log('snapshot: ' + JSON.stringify(snapshot));
            if ( snapshot.val() == null || snapshot.val().length === 0 ) {
                return resolve(true);
            } else {
                return resolve(false);
            }
        }).catch ( (err) => {
            console.error('error: ' + err);
            return reject(err);
        });
    });
}

function markElementsForPurge ( elements ) {
    for (let index = 0; index < RETVALUES; index++) {
        elements[index].purge = true;
    }
    return elements;
}

function purgeElements ( elements ) {
    return elements.filter ( e => e.purge !== true );
}

function reduceMarksOnField ( elements )  {
    return elements.filter ( e => Math.random() < 0.40);
}

function errMessage(errorMessage) {
    return { status: 500, message: JSON.stringify(errorMessage)};
}

function resultHasOnlyNieten(elements) {
    for (var index = 0; index < RETVALUES; index++) {
        if (elements[index].niete === false) {
            return false;
        }
    }
    return true;
}

function calcDistance(lat1, lon1, lat2, lon2, unit) {
    var radlat1 = Math.PI * lat1 / 180;
    var radlat2 = Math.PI * lat2 / 180;
    var theta = lon1 - lon2;
    var radtheta = Math.PI * theta / 180;
    var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
    dist = Math.acos(dist);
    dist = dist * 180 / Math.PI;
    dist = dist * 60 * 1.1515;
    if (unit == 'K') { dist = dist * 1.609344; }
    if (unit == 'N') { dist = dist * 0.8684; }
    if (dist < 0.001) {
        dist = 0;
    }
    return dist;
}

function saveElementsForUser(userid, elements, start, end) {
    console.log(`${start} : end: ${ end } userid: ${userid}`);
    return new Promise((resolve, reject) => {
        admin.database().ref('/users/' + userid).set(elements).then(() => {
            return resolve(elements.slice(start, end));
        }).catch((err) => {
            return reject(err);
        });
    });
}



////////////////////////////////////////////////////////////////////////////////
// for testing

router.get('/helloworld', (req, res, next) => {
    res.send('hello world 3');
});

module.exports = router;