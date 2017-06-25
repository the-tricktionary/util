var admin   = require("firebase-admin");
var fs      = require("fs");
var moment  = require("moment");
var exec    = require("child_process").exec;
var storage = require('@google-cloud/storage');
var isolang = require('../data/iso-lang-parse').getLanguageName;
var UUID    = require("uuid-v4");
var argv    = require('yargs')
             .usage('node $0 [-i [locale]|--i18n[=locale]|--locale[=locale]] [-l|--letterpaper] [-d|--detailed] [-h|--help]').wrap(require('yargs').terminalWidth())
             .alias('i18n', 'locale')
             .alias('i', 'i18n').describe('i', 'The locale the booklet should be generated with, if passed without argument a list of avilable locales will appear').default('i', 'en')
             .alias('l', 'letterpaper').boolean('l').describe('l', 'Will output the booklet in lettersized paper, if present')
             .alias('d', 'detailed')   .boolean('d').describe('d', 'Will include the description of the trick, if present')
             .alias('v', 'debug')      .boolean('v').describe('v', 'Enables debug mode, will be verbose and won\'t save to db')
             .alias('h', 'help').help('help')
             .argv;
var child;
var papersize;
var detailed;

function localize(trick, locale, thing) {
  var string;
  if(trick.i18n && trick.i18n[locale]) {
    string = trick.i18n[locale][thing] || trick[thing]
  } else {
    string = trick[thing]
  }
  string = latexescape(string)
  return string;
}

function latexescape(string) {
  // replace backslashes first: \
  string = string.replace(/([\\]{1})/gi, '\\textbackslash ')
  // reserved chars: & % $ # _ { }
  string = string.replace(/([\&%$#_{}]{1})/gi, '\\$1 ')
  // reserved chars that isn't easy \{char} but have special commands: ~ ^
  string = string.replace(/([\^]{1})/gi, '\\textasciicircum ')
  string = string.replace(/([~]{1})/gi, '\\textasciitilde ')
  // other chars
  string = string.replace(/([°]{1})/gi, '\\textdegree ')
  string = string.replace(/([×]{1})/gi, '$\\times$') 

  return string
}

var serviceAccount = require("../config/firebase-adminsdk.json");

if (argv.v) {
  function dlog(msg) { console.log(msg) }
  dlog("running in debug mode")
} else {
  function dlog(msg) { return true; }
}

if (argv.l) {
  papersize = "letter"
} else {
  papersize = "a4"
}

// initialize firebase app
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://project-5641153190345267944.firebaseio.com"
});

// create db reference
var db  = admin.database();
var ref = db.ref("/");

//initialize google cloud for storage
var gcs = storage({
  keyFilename: '../config/google-storageadmin.json',
});

dlog("init done");

if (typeof argv.i18n == "boolean" && argv.i18n) {
  ref.child('langs').once('value', (snapshot) => {
    var data = snapshot.val();
    console.log('avilable locales:')
    for(var lang in data) {
      console.log(`  ${lang}\t(${data[lang]})`)
    }
    process.exit(0);
  })
} else {

  // Get current datetime
  var now = moment().format("YYYYMMDD-HHmmss");

  //create storage reference
  var bucket = gcs.bucket('project-5641153190345267944.appspot.com');

  ref.on("value", function(snapshot) {
    dlog("data reciecved");
    var keys = [];
    var data = snapshot.val().tricks;
    var types = snapshot.val().tricktypes;
    var locales = snapshot.val().langs;

    var locale = (locales[argv.i18n] ? argv.i18n : 'en');
    var filename = `booklet-${now}-${papersize}-${locale}${(argv.d ? '-detailed' : '')}`;
    dlog(`creating ${filename}`);
    dlog(`locale: ${locale}`)

    // construct tex file contents
    var tex = `\\documentclass[12pt]{article}\n
               \\usepackage[utf8]{inputenc}\n
               \\usepackage{textcomp}
               \\usepackage[${isolang(locale).toLowerCase()}]{babel}\n
               \\usepackage{csquotes}\n`

    if (papersize == "letter" ) {
      tex += '\\usepackage[paperheight=8.5in,paperwidth=5.5in]{geometry}\n'
    } else {
      tex += '\\usepackage[a5paper]{geometry}\n'
    }

    tex += `\\usepackage{enumitem,amssymb,tabularx}\n
            \\newlist{todolist}{itemize}{2}\n
            \\setlist[todolist]{label=$\\square$,leftmargin=0pt,itemsep=0pt,parsep=0pt}\n
            \\title{the Tricktionary}\n
            \\author{}\n
            \\begin{document}\n
              \\clearpage\\maketitle\n
              \\thispagestyle{empty}\n
              \\vfill\n
              \\begin{small}\n
                \\noindent Detailed information about tricks are \\\\\n
                avilable on the-tricktionary.com or \\\\\n
                in the Tricktionary\'s android app.\n
              \\end{small}\n
              \\pagebreak\n`

    // tricks
    var keys = Object.keys(data);
    keys.forEach(function(key) {
      leveltypes = {};

      tex += '\\section*{Level ' + data[key].level + '}\n'

      for (var i in types.en) {
        Object.keys(data[key].subs).forEach(function(subKey) {
          var trick = data[key].subs[subKey]
          if (trick.type == types.en[i]) {
            if (!leveltypes[types.en[i]]) {
              tex += `\\subsection*{${(types[locale] ? types[locale][i] || types.en[i] : types.en[i])}}\n
                      \\begin{todolist}\n`
              leveltypes[types.en[i]] = true;
            }
            if (argv.d) {
              tex += `\\item \\textbf{${localize(trick, locale, "name")}}\\\\\n
                      ${localize(trick, locale, "description")}\n`
            } else {
              tex += `\\item ${localize(trick, locale, "name")}\n`
            }
          }
        })
        if(leveltypes[types.en[i]]) {
          tex += '\\end{todolist}\n'
        }
      }
    
      tex += '\\pagebreak\n'
    })

    // speed sheets
    for (var pages = 0; pages < 4; pages++) {
      tex += `\\section*{Speed event:  }\n
              \\noindent \\begin{tabularx}{\\linewidth}{|X|X|}\n
              \\hline\n
              Date & Count \\\\\n
              \\hline\n`
      for (var lines = 0; lines < 26; lines++) {
        tex += ` & \\\\\n
                \\hline\n`
      }
      tex += '\\end{tabularx}\n'
      if (pages !== 3) {
        tex += '\\pagebreak\n'
      }
      if (pages == 3) {
      tex += `\\vfill\n
              \\begin{tiny}\n
              \\copyright the Tricktionary 2016-${moment().format('YYYY')}\n
              \\end{tiny}\n`
      }

    }

    tex += '\\end{document}\n'

    // tex for booklet version
    var bookletTex = `\\documentclass[12pt]{article}\n`

    if(papersize == "letter") {
      bookletTex += '\\usepackage[letterpaper]{geometry}\n'
    } else {
      bookletTex += '\\usepackage[a4paper]{geometry}\n'
    }

    bookletTex += `\\usepackage{pdfpages}\n
                   \\includepdfset{pages=-}\n
                   \\title{the Tricktionary}\n
                   \\author{}\n
                   \\begin{document}\n
                   \\includepdf[pages=-,landscape,booklet=true]{../data/booklets/raw-${filename}.pdf}\n
                   \\end{document}\n`

    fs.writeFile('../data/booklets/raw-' + filename + '.tex', tex, function(err) {
      if (err) throw err;
      dlog("tex rawbooklet saved");
      fs.writeFile('../data/booklets/' + filename + '.tex', bookletTex, function(err) {
        if (err) throw err;
        dlog("tex booklet saved");
        dlog("generating booklet pdf")
        //exec pdflatex on raw
        child = exec("/usr/local/texlive/2016/bin/armhf-linux/pdflatex -output-directory=../data/booklets -synctex=1 -interaction=nonstopmode ../data/booklets/raw-" + filename + ".tex", function (error, stdout, stderr) {
          dlog('stdout: ' + stdout);
          dlog('stderr: ' + stderr);
          if (error !== null) {
            dlog('exec error: ' + error);
          }
          if (error === null) {
            dlog("rawbooklet pdf generated");
            dlog("generating booklet pdf");
            child2 = exec("/usr/local/texlive/2016/bin/armhf-linux/pdflatex -output-directory=../data/booklets -synctex=1 -interaction=nonstopmode ../data/booklets/" + filename + ".tex", function(error, stdout, stderr) {
              dlog('stdout: ' + stdout);
              dlog('stderr: ' + stderr);
              if (error !== null) {
                dlog('exec error: ' + error);
              }
              if (error === null) {
                dlog("booklet pdf generated");
                dlog("uploading booklet pdf to firebase storage")
                var uuid = UUID();
                var options = {
                  destination: 'booklets/' + filename + '.pdf',
                  metadata: {
                    firebaseStorageDownloadTokens: uuid
                  }
                }
                bucket.upload('../data/booklets/' + filename + '.pdf', options, function(err, file) {
                  if(!err) {
                    dlog("booklet successfully uploaded");
                    dlog("saving filename to db");
        
                    var sfu = db.ref(`/booklets/latest/${locale}/${papersize}${(argv.d ? 'detailed' : '')}`).set(`https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${uuid}`, (error) => { if(error) { process.exit(1) } else { dlog("file download path saved"); } })
                    var sfn = db.ref(`/booklets/history/${locale}/${papersize}${(argv.d ? 'detailed' : '')}`).push(file.name, function(error) { if(error) { proccess.exit(1);} else { dlog("filename for latest updated in db"); process.exit() } })
                    Promise.all([sfu,sfn]).then(function() { process.exit(0) })
                  }
                })
              }
            })
          }
        });
      });
    });
  });
}

setTimeout(function() {
  console.log("booklet creation failed, timeout");
  process.exit(1);
}, 360000);

