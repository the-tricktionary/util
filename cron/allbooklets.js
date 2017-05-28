const admin   = require("firebase-admin");
const exec    = require("child-process-promise").exec;
const isolang = require('../data/iso-lang-parse').getLanguageName;

const serviceAccount = require("../config/firebase-adminsdk.json");
const opts = {
  '':    'a4',
  '-d':  'a4detailed',
  '-l':  'letter',
  '-dl': 'letterdetailed'
}
var debug;
var n = 0;

function fill(str, len) {
  if(str) {
    return str + (new Array(len - str.length + 1).join(" "))
  } else {
    return (new Array(len + 1).join(" "))
  }
}

function progress(obj) {
  var table = `\x1Bc
\t +=====================+===========+=============+===========+=================+ 
\t |      Language       |    a4     | a4 detailed |  letter   | letter detailed | 
\t +=====================+===========+=============+===========+=================+ `
  Object.keys(obj).forEach((lang) => {
    table += `
\t | ${fill(isolang(lang), 19)} | ${fill(obj[lang].a4, 9)} | ${fill(obj[lang].a4detailed, 11)} | ${fill(obj[lang].letter, 9)} | ${fill(obj[lang].letterdetailed, 15)} | 
\t +---------------------+-----------+-------------+-----------+-----------------+ `
  })
  dlog(table)
}

// initialize firebase app
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://project-5641153190345267944.firebaseio.com"
});

if(process.argv.indexOf("debug") != -1) {
  //debug = true;
  debug = false;
  function dlog(msg) { console.log(msg) }
} else {
  debug = false;
  function dlog() {}
}

admin.database().ref('/langs').once('value', (snapshot) => {
  const langs = Object.keys(snapshot.val());
  var promises = [];
  var statuses = {}
  dlog(langs);
  langs.forEach((lang) => {
    if(!statuses[lang]) { statuses[lang] = {} };
    Object.keys(opts).forEach((opt) => {
      setTimeout(() => { 
        statuses[lang][opts[opt]] = "started";
        progress(statuses);
        promises.push(
          exec(`node ./booklet.js --i18n=${lang} ${opt} ${(debug ? '-v' : '')}`)
           .then(() => { 
            statuses[lang][opts[opt]] = "finnished";
            progress(statuses)
           })
           .catch((err) => { 
            statuses[lang][opts[opt]] = "errored";
            progress(statuses)
           }))
      }, n)
      n += 60000;
    })
  })
  setTimeout(function() {
    Promise.all(promises).then(() => {
      process.exit(0)
    })
  }, n)
})
