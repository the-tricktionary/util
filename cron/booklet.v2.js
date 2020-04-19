const admin = require('firebase-admin')
const fs = require('fs')
const moment = require('moment')
const yargs = require('yargs')
const es6t = require('express-es6-template-engine')
const pjoin = require('path').join
const isolang = require('../data/iso-lang-parse').getLanguageName

const argv = yargs
  .usage('node $0 [-i [locale]|--i18n[=locale]|--locale[=locale]] [-l|--letterpaper] [-d|--detailed] [-h|--help]').wrap(yargs.terminalWidth())
  .alias('i18n', 'locale')
  .alias('i', 'i18n').describe('i', 'The locale the booklet should be generated with, if passed without argument a list of avilable locales will appear').default('i', 'en')
  .alias('l', 'letterpaper').boolean('l').describe('l', 'Will output the booklet in lettersized paper, if present')
  .alias('d', 'detailed').boolean('d').describe('d', 'Will include the description of the trick, if present')
  .alias('f', 'fancy').boolean('f').describe('f', 'Will be in colour \'n stuff')
  .alias('t', 'type').choices('t', ['SR', 'DD', 'WH']).describe('t', 'If the booklet should be Single Rope, Double Dutch or Wheels').default('t', 'SR')
  .describe('isbn', 'Provide an ISBN number for real prints. format: 000-00-000-0000-0').default('isbn', '000-00-000-0000-0')
  .alias('v', 'debug').boolean('v').describe('v', "Enables debug mode, will be verbose and won't save to db")
  .alias('h', 'help').help('help')
  .argv

/**
   *
   * @param {object} source
   * @param {array} locale
   * @param {string} prop
   *
   * @returns {string}
   */
function localize (source, locale, prop) {
  let out = source[prop]
  const match = locale.find(l => l.id === source.id)

  if (match && match[prop]) {
    out = match[prop]
  }

  out = latexescape(out)

  return out
}

/**
 *
 * @param {string} string
 *
 * @returns {string}
 */
function latexescape (string) {
  // replace backslashes first: \
  string = string.replace(/([\\]{1})/gi, '\\textbackslash ')
  // reserved chars: & % $ # _ { }
  string = string.replace(/([&%$#_{}]{1})/gi, '\\$1 ')
  // reserved chars that isn't easy \{char} but have special commands: ~ ^
  string = string.replace(/([\^]{1})/gi, '\\textasciicircum ')
  string = string.replace(/([~]{1})/gi, '\\textasciitilde ')
  // other chars
  string = string.replace(/([°]{1})/gi, '\\textdegree ')
  string = string.replace(/([×]{1})/gi, '$\\times$')

  return string
}

const serviceAccount = require('../config/firebase-adminsdk.json')
let dlog = _ => true

if (argv.v) {
  dlog = (...args) => console.log(...args)
  dlog('running in debug mode')
}

// initialize firebase app
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://project-5641153190345267944.firebaseio.com'
})

const db = admin.firestore()
const now = moment().format('YYYYMMDD-HHmmss')
const filename = `booklet-${now}-${argv.l ? 'letter' : 'a4'}-${argv.i}${(argv.d ? '-detailed' : '')}${argv.f ? '-fancy' : ''}`
dlog(filename)

async function generate () {
  const tSnap = await db.collection('tricks' + argv.t).get()
  const lTrickSnap = argv.i ? (await db.collection('i18n').doc(argv.i).collection('tricks').get()) : []
  const lTypesObj = (await db.collection('i18n').doc(argv.i).collection('tricktypes').doc('translated').get()).data()

  const tricks = []
  const lTricks = []

  tSnap.forEach(dSnap => {
    tricks.push({
      id: dSnap.id,
      ...dSnap.data()
    })
  })

  lTrickSnap.forEach(dSnap => {
    lTricks.push({
      id: dSnap.id,
      ...dSnap.data()
    })
  })

  dlog('Tricks: ' + tricks.length)

  const levels = tricks.map(t => t.level).filter((lev, idx, arr) => arr.indexOf(lev) === idx).sort()
  const types = tricks.map(t => t.type).map(ty => latexescape(lTypesObj[ty] || ty)).filter((typ, idx, arr) => arr.indexOf(typ) === idx).sort()

  dlog('Levels: ', levels)
  dlog('Types: ', types)

  const fmtTricks = tricks.map(t => ({
    id: t.id,
    level: t.level,

    type: latexescape(lTypesObj[t.type] || t.type),
    name: localize(t, lTricks, 'name'),
    description: localize(t, lTricks, 'description'),

    levels: t.levels
  })).sort((a, b) => a.name.localeCompare(b.name))

  const rendered = await new Promise((resolve, reject) => {
    es6t(pjoin(__dirname, argv.f ? '../templates/fancy.tex' : '../templates/print.tex'), {
      locals: {
        locale: isolang(argv.i).toLowerCase(),
        papersize: argv.l ? 'letter' : 'a4',
        detailed: argv.d,
        isbn: argv.isbn,
        year: moment().format('YYYY'),

        levels,
        types,
        tricks: fmtTricks,

        speed: 7
      },
      partials: {
        _tricks: pjoin(__dirname, '../templates/tricks.tex'),
        _speed: pjoin(__dirname, '../templates/speed.tex')
      }
    },
    (e, c) => {
      if (e) reject(e)
      resolve(c)
    })
  })

  fs.writeFileSync(pjoin(__dirname, '../data/booklets', `booklet-raw-${filename}.tex`), rendered)
}

generate()
