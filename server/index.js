var path = require('path');
require("dotenv").config({ path: path.join(__dirname, '/config', 'env') });
console.log("path", path.join(__dirname, '/config', 'env'));
const express = require("express");
const morgan = require("morgan");
console.log("__dirname",__dirname);
const connectDB = require("./config/db.js");

// Routes
const authkeyRoutes = require("./routes/authkey");
const templateRoutes = require("./routes/templates");
const messageRoutes = require("./routes/message");
const historyRoutes = require("./routes/history");
const callbackRoutes = require("./routes/callbacks");
const bulkRoutes = require("./routes/bulk");
const workflowRoutes = require("./routes/workflow");
const hubspotWorkflowRoutes = require("./routes/hubspotWorkflowRoutes");


// --------------------------------------------------
// Database
// --------------------------------------------------

connectDB();


// --------------------------------------------------
// Express App
// --------------------------------------------------

const app = express();

const PORT = process.env.PORT || 5000;



// --------------------------------------------------
// Project Paths
// --------------------------------------------------

const projectRoot = path.resolve(__dirname, "..");
const appDirectory = path.join(projectRoot, "app");


// --------------------------------------------------
// Basic Configuration
// --------------------------------------------------

app.set("port", PORT);

app.disable("x-powered-by");


// --------------------------------------------------
// Middleware
// --------------------------------------------------

// Request logger
app.use(morgan("dev"));


// Parse JSON requests
// rawBody is preserved because callbacks/webhooks
// may need the original request body.
app.use(
  express.json({
    verify: (req, res, buffer) => {
      req.rawBody = buffer;
    }
  })
);


// Parse form data
app.use(
  express.urlencoded({
    extended: false
  })
);


// --------------------------------------------------
// CORS
// --------------------------------------------------

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
})


// --------------------------------------------------
// API Routes
// --------------------------------------------------

// Templates
app.use(
  `/api/templates`,
  templateRoutes
);

// Authkey
app.use(
  `/api/authkey`,
  authkeyRoutes
);

// Messages
app.use(
  `/api/message`,
  messageRoutes
);

// Callbacks
app.use(
  `/api/callbacks`,
  callbackRoutes
);

// Bulk messaging
app.use(
  `/api/bulk`,
  bulkRoutes
);

// Message history
app.use(
  `/api/history`,
  historyRoutes
);

// Workflow
app.use(
  `/api/workflow`,
  workflowRoutes
);

// HubSpot workflow
app.use(
  `/api/hubspot/workflow`,
  hubspotWorkflowRoutes
);


// --------------------------------------------------
// Zoho Plugin Manifest
// --------------------------------------------------

app.get(
  `/api/plugin-manifest.json`,
  (req, res) => {
    res.sendFile(
      path.join(
        projectRoot,
        "plugin-manifest.json"
      )
    );
  }
);


// --------------------------------------------------
// Zoho Extension App
// --------------------------------------------------

app.use(
  `/app`,
  express.static(appDirectory)
);

app.get("/test", (req, res) => {
  res.send("Test route is working");
});

// // --------------------------------------------------
// // 404 Handler
// // --------------------------------------------------

// app.use((req, res) => {
//   res.status(404).json({
//     success: false,
//     message: "Route not found",
//     path: req.originalUrl
//   });
// });


// // --------------------------------------------------
// // Error Handler
// // --------------------------------------------------

// app.use((err, req, res, next) => {
//   console.error("Server Error:", err);

//   res.status(err.status || 500).json({
//     success: false,
//     message: "Internal server error"
//   });
// });

