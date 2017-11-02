var admin  = require("firebase-admin");
var fs     = require("fs");
var moment = require("moment");
var storage = require('@google-cloud/storage');

var serviceAccount = require("../config/firebase-adminsdk.json");

if (true || process.argv[2] == "test") {
  function dlog(msg) { console.log(msg) }
  // dlog("running in debug mode")
} else {
  function dlog(msg) { return true; }
}

// initialize firebase app
admin.initializeApp({
  credential:  admin.credential.cert(serviceAccount),
  databaseURL: "https://project-5641153190345267944.firebaseio.com"
});

//initialize google cloud for storage
var gcs = storage({
  keyFilename: '../config/google-storageadmin.json',
});

dlog("init done");

// Get current datetime
var now = moment().format("YYYYMMDD-HHmmss");

dlog("backing up db " + now);

// create db reference
var db  = admin.database();
var ref = db.ref("/");

//create storage reference
var bucket = gcs.bucket('project-5641153190345267944.appspot.com');

ref.on("value", function(data) {
  dlog("recieved data, writing to file ../data/backups/backup-" + now + ".json")
  fs.writeFile('../data/backups/backup-' + now + '.json', JSON.stringify(data.val()), function(err) {
    if (err) throw err;
    dlog("backup saved");
    dlog("uploading backup")
    var options = {
      destination: 'backups/backup-' + now + '.json'
    }
    bucket.upload('../data/backups/backup-' + now + '.json', options, function(err, file) {
      if(!err) {
        dlog("backup successfully uploaded");
        process.exit();
      }
    })
  });
})

setTimeout(function() {
  console.log("backup failed, timeout");
  process.exit(1);
}, 60000);
