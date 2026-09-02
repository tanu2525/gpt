var path = require('path');
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const express = require("express");
const morgan = require("morgan");
const connectDB = require("./config/db.js");

const authkeyRoutes = require("./routes/authkey");
const templateRoutes = require("./routes/templates");
const messageRoutes = require("./routes/message");
const historyRoutes = require("./routes/history");
const callbackRoutes = require("./routes/callbacks");
const bulkRoutes = require("./routes/bulk");
const workflowRoutes = require("./routes/workflow");
const zohoMetadataRoutes = require("./routes/zohoMetadata");
const zohoAuthkeyBulkRoutes = require("./routes/zohoAuthkeyBulk");

connectDB();

const app = express();
const PORT = process.env.PORT || 5000;
const projectRoot = path.resolve(__dirname, "..");
const appDirectory = path.join(projectRoot, "app");

app.set("port", PORT);
app.disable("x-powered-by");
app.use(morgan("dev"));
app.use(express.json({ verify: (req, res, buffer) => { req.rawBody = buffer; } }));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Workflow-Secret");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use("/api/templates", templateRoutes);
app.use("/api/authkey", authkeyRoutes);
app.use("/api/message", messageRoutes);
app.use("/api/callbacks", callbackRoutes);
app.use("/api/bulk", bulkRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/workflow", workflowRoutes);
app.use("/api/zoho", zohoMetadataRoutes);
app.use("/api/zoho/authkey", zohoAuthkeyBulkRoutes);

app.get("/api/plugin-manifest.json", (req, res) => {
  res.sendFile(path.join(projectRoot, "plugin-manifest.json"));
});

app.use("/app", express.static(appDirectory));
app.get("/test", (req, res) => res.send("Test route is working"));

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
