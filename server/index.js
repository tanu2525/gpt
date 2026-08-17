/*
Copyright (c) 2017, ZOHO CORPORATION
License: MIT
*/

require("dotenv").config();

const connectDB = require("./config/db");
var fs = require('fs');
var path = require('path');
var express = require('express');
var bodyParser = require('body-parser');
var errorHandler = require('errorhandler');
var morgan = require('morgan');
var serveIndex = require('serve-index');
var https = require('https');
var chalk = require('chalk'); 
const authkeyRoutes = require("./routes/authkey.js");
const templateRoutes = require("./routes/templates");
const messageRoutes =
require("./routes/message");  
const historyRoutes = require("./routes/history");
const callbackRoutes = require("./routes/callbacks");
const bulkRoutes =
require("./routes/bulk");
const wf = require("./routes/workflow");
connectDB();
process.env.PWD = process.env.PWD || process.cwd();

var port = process.env.PORT;
var expressApp = express();
var projectRoot = path.resolve(__dirname, "..");
var appDirectory = path.join(projectRoot, "app");
// Serve the same application locally and below the public reverse-proxy path.
var configuredBasePath = (process.env.APP_BASE_PATH || "/v6/api").replace(/\/+$/, "");
if (configuredBasePath && !configuredBasePath.startsWith("/")) configuredBasePath = "/" + configuredBasePath;
expressApp.set('port', port);
expressApp.use(morgan('dev'));
expressApp.use(bodyParser.json({ verify: (req, res, buffer) => { req.rawBody = buffer; } }));
expressApp.use(bodyParser.urlencoded({ extended: false }));
expressApp.disable("x-powered-by");


expressApp.use("/api/templates", templateRoutes);
expressApp.use("/api/authkey", authkeyRoutes);
expressApp.use("/api/message", messageRoutes);
expressApp.use("/api/callbacks", callbackRoutes);
expressApp.use("/api/bulk", bulkRoutes);
expressApp.use("/api/history", historyRoutes);
expressApp.use("/api/workflow", wf);
expressApp.use(errorHandler());


expressApp.use('/', function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

expressApp.get('/plugin-manifest.json', function (req, res) {
  res.sendFile(path.join(process.cwd(), 'plugin-manifest.json'));
});

expressApp.use('/app', express.static('app'));
expressApp.use('/app', serveIndex('app'));

expressApp.use(configuredBasePath + "/templates", templateRoutes);
expressApp.use(configuredBasePath + "/authkey", authkeyRoutes);
expressApp.use(configuredBasePath + "/message", messageRoutes);
expressApp.use(configuredBasePath + "/callbacks", callbackRoutes);
expressApp.use(configuredBasePath + "/bulk", bulkRoutes);
expressApp.use(configuredBasePath + "/history", historyRoutes);
expressApp.use(configuredBasePath + "/workflow", wf);
expressApp.get(configuredBasePath + "/plugin-manifest.json", function (req, res) {
  res.sendFile(path.join(projectRoot, "plugin-manifest.json"));
});
expressApp.use(configuredBasePath + "/app", express.static(appDirectory));
expressApp.use(configuredBasePath + "/app", serveIndex(appDirectory));


expressApp.get('/', function (req, res) {
  res.redirect('/app');
});

var options = {
  key: fs.readFileSync('./key.pem'),
  cert: fs.readFileSync('./cert.pem')
};
https.createServer(options, expressApp).listen(port, function () {
  console.log(chalk.green('Zet running at ht' + 'tps://127.0.0.1:' + port));
  console.log(chalk.bold.cyan("Note: Please enable the host (https://127.0.0.1:"+port+") in a new tab and authorize the connection by clicking Advanced->Proceed to 127.0.0.1 (unsafe)."));
}).on('error', function (err) {
  if (err.code === 'EADDRINUSE') {
    console.log(chalk.bold.red(port + " port is already in use"));
  }
});
