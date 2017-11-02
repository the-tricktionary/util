var admin      = require("firebase-admin");
var objectdiff = require("objectdiff");
var fs         = require("fs");
var moment     = require("moment");

var serviceAccount = require("../config/firebase-adminsdk.json");

if(process.argv[2] == "test") {
  var mailgunConf   = require("../config/mailgun-test.json");
} else {
  var mailgunConf   = require("../config/mailgun-conf.json");
}

function dlog(msg) {
  console.log(msg)
}

if (false && fs.existsSync("../data/email/last.json")) {
  var last = require("../data/email/last.json");
} else {
  var last;
  var init = true;
}

if (init) {
  dlog("first run");
} else {
  dlog("got last data");
}

var mailgun    = require("mailgun-js")(mailgunConf);

// initialize firebase app
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://project-5641153190345267944.firebaseio.com"
});

// create db reference to contacts
var db  = admin.database();
var ref = db.ref("/contact");

var loaded = false;

dlog("init done");

function checker(obj, user) {
  diffedchilds = [];
  if(obj.changed == "equal") {
    return "equal";
  }
  Object.keys(obj.value).forEach(function(key) { 
    if (obj.value[key].changed == "added" || obj.value[key].changed == "object change") {
      dlog("diff in " + key + ": " + obj.value[key].changed );
      diffedchilds.push(key);
    }
  })
  var prepared = prepare(obj, diffedchilds, user)
  return prepared;
}

function prepare(obj, arr, user) {
  diffedchilds = [];
  arr.forEach(function(key) {
    diffedchilds.push({
      "changed": obj.value[key].changed,
      "key":     key,
      "value":   obj.value[key].value,
      "user":    user
    })
  })
  return diffedchilds;
}

function sendEmails(arr) {
  var html = "<html><body>"
  if (arr.length == 0) {
    dlog("empty array, nothing new")
    return;
  } else if (arr.length == 1) {
    var obj = arr[0];

    var url = 'https://the-tricktionary.com/contact?u=' + obj.user + '&i=' + obj.key;

    html += '<script type="application/ld+json">\n'
    html += '{\n'
    html += '  "@context": "http://schema.org",\n'
    html += '  "@type":    "EmailMessage",\n'
    html += '  "potentialAction": {\n'
    html += '    "@type":  "ViewAction",\n'
    html += '    "target": "' + url + '",\n';
    html += '    "name":   "View Contact Issue"\n'
    html += '  },\n'
    html += '  "description": "View Contact Issue"\n'
    html += '}\n'
    html += '</script>\n'

    html += "<p>\n"
    if (obj.changed == "added") {
      html += "A new issue has been created:<br/>\n"
      html += '<a href="' + url + '">View Issue</a><br/>\n';
      html += '<b>' + obj.value.type + ': </b>';
      html += obj.value.desc
    } else {
      html += "An issue has been modified:<br/>\n"
      sendUserEmail(obj)
      html += '<a href="' + url + '">View Issue</a><br/>\n';
      html += '<b>' + obj.value.type.value + ': </b>';
      html += obj.value.desc.value
    }
    html += '</p>'
  } else {
    html += '<p>The following issues has been created:</p>\n'
    html += '<ul>\n'
    arr.forEach(function(obj) {
      if (obj.changed == "added" ) {
        html += '<li><a href="https://the-tricktionary.com/contact?u=' + obj.user + '&i=' + obj.key + '">' + obj.value.type + ' - ' + obj.value.desc.substring(0, 20) + '</a></li>';
      }
    })
    html += "</ul>"
    html += "<p>The following issues has been modified:</p>\n"
    html += "<ul>"
    arr.forEach(function(obj) {
      if (obj.changed == "object change") {
        html += '<li><a href="https://the-tricktionary.com/contact?u=' + obj.user + '">' + obj.value.type.value + ' - ' + obj.value.desc.value.substring(0, 20) + '</a></li>';
        sendUserEmail(obj)
      }
    })
  }
  html += "</body>"
  sendAdminEmail(html)
  return;
}

function sendAdminEmail(html) {
  dlog("sendling admin email")
  var emailData = {
    from:    "the Tricktionary <noreply@" + mailgunConf.domain + ">",
    to:      mailgunConf.to,
    subject: "Updates to the Tricktionary " + moment().format("YYYY-MM-DD"),
    html:    html
  };
  if(html !== null) {
    dlog("updates made, sending")
    mailgun.messages().send(emailData, function(err, body) {
      if (err) throw err;
      dlog("admin email sent");
    });
  } else {
    dlog("nothing new")
  }
}

function sendUserEmail(obj) {
  if(obj.value.email) {
    var html = "<html><body>"

    var url = 'https://the-tricktionary.com/contact?i=' + obj.key;

    html += '<script type="application/ld+json">\n'
    html += '{\n'
    html += '  "@context": "http://schema.org",\n'
    html += '  "@type":    "EmailMessage",\n'
    html += '  "potentialAction": {\n'
    html += '    "@type":  "ViewAction",\n'
    html += '    "target": "' + url + '",\n';
    html += '    "name":   "View Contact Issue"\n'
    html += '  },\n'
    html += '  "description": "View Contact Issue"\n'
    html += '}\n'
    html += '</script>\n'

    html += "<p>Hello,<br/>You have recieved updates (most certainly replies) to one of the issues you created on the Tricktionary:</p>"
    html += '<p><a href="' + url + '">' + obj.value.type.value + ' - ' + obj.value.desc.value.substring(0, 20) + '...</a></p>'
    html += "<p>Thank you for using the Tricktionary</p>"
    html += '<a href="https://the-tricktionary.com/contact?unsub=' + obj.key + '">Unsubscribe from email updates on this issue</a>'
    var emailData = {
      from:    "the Tricktionary <noreply@" + mailgunConf.domain + ">",
      to:      obj.value.email.value,
      subject: "Updates to one of your issues on the Tricktionary",
      html:    html
    }
    mailgun.messages().send(emailData, function(err, body) {
      if (err) throw err;
      dlog("User email sent for issue " + obj.user + "/" + obj.key);
    })
  }
}

function processSnapshot(snapshot, type) {
  if(!loaded) return;
  var data = snapshot.val();
  var key  = snapshot.key;
  var diff = objectdiff.diff(last[key], data)
  
  var prepared = checker(diff, key);  

  sendEmails(prepared);

  last[key] = data;

  //fs.writeFile('../data/email/last.json', JSON.stringify(last), function(err) {
  //  if(err) throw err;
  //  dlog("last.json written")
  //})
}

ref.on("child_added",   processSnapshot)
ref.on("child_changed", processSnapshot)
ref.once("value",       function(snapshot) {
  if(!init) {
    loaded = true;
    dlog("loaded")
  } else {
    //fs.writeFile('../data/email/last.json', JSON.stringify(snapshot.val()), function(err) {
    //  if (err) throw err;
      last = snapshot.val();
      dlog("init done")
      loaded = true
      dlog("loaded")
    //})
  }
})

