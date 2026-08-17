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
const hubspotWorkflowRoutes = require("./routes/hubspotWorkflowRoutes");
connectDB();


var port = process.env.PORT;
var expressApp = express();
var projectRoot = path.resolve(__dirname, "..");
var appDirectory = path.join(projectRoot, "app");
// Serve the same application locally and below the public reverse-proxy path.
var configuredBasePath = (process.env.APP_BASE_PATH || "/v6/api").replace(/\/+$/, "");
if (configuredBasePath && !configuredBasePath.startsWith("/")) configuredBasePath = "/" + configuredBasePath;
var mountPaths = [...new Set(["", configuredBasePath])];
expressApp.set('port', port);
expressApp.use(morgan('dev'));
expressApp.use(bodyParser.json({ verify: (req, res, buffer) => { req.rawBody = buffer; } }));
expressApp.use(bodyParser.urlencoded({ extended: false }));

//Allow requests from any origin/website
expressApp.use('/', function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});
expressApp.disable("x-powered-by");


mountPaths.forEach(function (basePath) {
  const apiBasePath = basePath || "/api";
  expressApp.use(apiBasePath + "/templates", templateRoutes);
  expressApp.use(apiBasePath + "/authkey", authkeyRoutes);
  expressApp.use(apiBasePath + "/message", messageRoutes);
  expressApp.use(apiBasePath + "/callbacks", callbackRoutes);
  expressApp.use(apiBasePath + "/bulk", bulkRoutes);
  expressApp.use(apiBasePath + "/history", historyRoutes);
  expressApp.use(apiBasePath + "/workflow", wf);
  expressApp.use(apiBasePath + "/hubspot/workflow", hubspotWorkflowRoutes);
  expressApp.get(basePath + "/plugin-manifest.json", function (req, res) {
    res.sendFile(path.join(projectRoot, "plugin-manifest.json"));
  });
  expressApp.use(basePath + "/app", express.static(appDirectory));
  expressApp.use(basePath + "/app", serveIndex(appDirectory));
});

expressApp.get('/', function (req, res) {
  res.redirect('/app');
});

expressApp.use(errorHandler());

//This loads SSL/TLS certificate.
/*key.pem- Private cryptographic key.
cert.pem-SSL certificate.

Together they allow your local server to run with:

HTTPS

instead of HTTP.*/
var options = {
  key: fs.readFileSync('./key.pem'),
  cert: fs.readFileSync('./cert.pem')
};
https.createServer(options, expressApp).listen(port, function () {
  console.log(chalk.green('Zet running at ht' + 'tps://127.0.0.1:' + port));
  console.log(chalk.bold.cyan("Note: Please enable the host (https://127.0.0.1:"+port+") in a new tab and authorize the connection by clicking Advanced->Proceed to 127.0.0.1 (unsafe)."));
}).on('error', function (err) {
  if (err.code === 'EADDRINUSE') {          //EADDRINUSE means:The port is already being used by another process.
    console.log(chalk.bold.red(port + " port is already in use"));
  }   
});
