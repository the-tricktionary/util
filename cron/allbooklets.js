const admin   = require("firebase-admin");
const exec    = require("child-process-promise").exec;
const isolang = require('../data/iso-lang-parse').getLanguageName;
const argv    = require('yargs')
               .usage('node $0 [-t|--timer] [-v|--status] [-h|--help]').wrap(require('yargs').terminalWidth())
               .alias('t', 'timer').number('t')   .describe('t', 'Number of seconds between starting each job') .default('t', 60)
               .alias('v', 'status').boolean('v') .describe('v', 'Shows the stats dashboard')                   .default('v', false)
               .alias('h', 'help').help('help')
               .argv;

const serviceAccount = require("../config/firebase-adminsdk.json");
const opts = {
  '':    'a4',
  '-d':  'a4detailed',
  '-l':  'letter',
  '-dl': 'letterdetailed'
}
var n = 0;

function fill(str, len) {
  if(str) {
    return str + (new Array(len - str.length + 1).join(" "))
  } else {
    return (new Array(len + 1).join(" "))
  }
}

function progress(obj, updatedLang, updatedSize) {
  if(argv.v) {
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
  } else {
    dlog(`${updatedLang} ${updatedSize}: ${obj[updatedLang][updatedSize]}`)
  }
}

// initialize firebase app
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://project-5641153190345267944.firebaseio.com"
});

if(true || argv.v) {
  function dlog(msg) { console.log(msg) }
} else {
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
        progress(statuses, lang, opts[opt]);
        promises.push(
          exec(`node ./booklet.js --i18n=${lang} ${opt}`)
           .then(() => { 
            statuses[lang][opts[opt]] = "finnished";
            progress(statuses, lang, opts[opt])
           })
           .catch((err) => { 
            dlog(err)
            statuses[lang][opts[opt]] = "errored";
            progress(statuses, lang, opts[opt])
           }))
      }, n)
      n += argv.t * 1000;
    })
  })
  setTimeout(function() {
    Promise.all(promises).then(() => {
      process.exit(0)
    })
  }, n)
})
