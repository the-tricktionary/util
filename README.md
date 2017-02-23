# util
Cron jobs and daemons for the tricktionary

## Config Files
```
config/
├── firebase-adminsdk.json
├── google-storageadmin.json
├── mailgun-conf.json
└── mailgun-test.json
```

### firebase-adminsdk.json
Generate one on `https://console.firebase.google.com/project/<projectid>/settings/serviceaccounts/adminsdk`

### google-storageadmin.json
Generate one on `https://console.developers.google.com/iam-admin/serviceaccounts/project?project=<projectid>`
(Click "create new service account" pick a name and select role: `Storage->Storage Object Admin` or `Storage->Storage Object Creator`)

### mailgun-conf.json
Copy config/mailgun.example.json and fill it in as follow

  - `apiKey` to your mailgun apiKey
  - `domain` to the mailgun domain you want to use
  - `to`     to the email(s) of the administrator(s) that will recieve notifications about all changes

### mailgun-test.json
Copy config/mailgun.example.json and fill it in as follow

  - `apiKey` to your mailgun apiKey
  - `domain` to one of your mailgun sandbox domain
  - `to`     to the email(s) of the administrator(s) that will recieve notifications about all changes, it should be authorised to recieve emails from your sandbox domain

