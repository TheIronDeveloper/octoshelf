/**
 * Super-Duper Simple Express
 * Instantiate an express object, and handle `GET /`.
 */

'use strict';

let express = require('express');
let path = require('path');
let ejs = require('ejs');
let request = require('request');
let config = require('./config/config.json');
let session = require('express-session');
const app = express();

const github_client_id = process.env.GITHUB_CLIENT_ID || '';
const github_client_secret = process.env.GITHUB_CLIENT_SECRET || '';
const personal_access_token = process.env.PERSONAL_ACCESS_TOKEN || '';

const tokenPayload = {
  "client_id": github_client_id,
  "client_secret": github_client_secret
};
const accessTokenOptions = {
  url: config.githubTokenUrl,
  method: 'POST',
  json: true,
  headers: {
    Accept: 'application/json'
  }
};

config.githubAuthUrl += '?client_id=' + github_client_id

app.use(express.static(path.join(__dirname, 'public')));
app.engine('ejs', ejs.renderFile);
app.use(session({
  secret: 'super secret keyboard cat'
}));

function getAccessToken(req) {
  return personal_access_token || req.session.accessToken || '';
}

app.get('/', function (req, res) {
  let origin = req.protocol + '://' + req.get('host');
  let accessToken = getAccessToken(req);
  let data = Object.assign({}, config, {origin, accessToken});
  res.render('index.ejs', data);
});

app.get('/auth', function (req, res) {
  let origin = req.protocol + '://' + req.get('host');
  let query = req.query;
  let code = query.code || '';
  let accessToken = getAccessToken(req);
  let data = Object.assign({}, { accessToken, origin });
  if (code) {
    let body = Object.assign({}, tokenPayload, { code });
    let opts = Object.assign({}, accessTokenOptions, { body });
    return request(opts, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        accessToken = body.access_token;
        req.session.accessToken = accessToken;
        data.accessToken = accessToken;
      }
      res.render('auth.ejs', data);
    });
  }
  res.render('auth.ejs', data);
});

let port = process.env.PORT || 5000;
app.listen(port, function () {
  console.log(`OctoShelf, http://localhost:${port}/`);
});