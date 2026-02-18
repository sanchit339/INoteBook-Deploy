const connectToMongo = require("./db");
var cors = require('cors')
const { randomUUID } = require('crypto');


const express = require('express')
connectToMongo();

const app = express()
const port = process.env.PORT || 4001

const allowedOrigins = new Set([
  'https://i-note-book-deploy-frontend.vercel.app',
  'https://i-note-book-deploy.vercel.app',
  'http://localhost:3000'
]);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  // Allow Vercel preview deployments for this frontend project
  if (/^https:\/\/i-note-book-deploy-frontend.*\.vercel\.app$/.test(origin)) return true;
  return false;
};

const makeRequestId = () => {
  if (typeof randomUUID === 'function') {
    return randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
    }
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, auth-token');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  return next();
});

app.use((req, res, next) => {
  const reqId = req.headers['x-request-id'] || makeRequestId();
  req.reqId = reqId;
  res.setHeader('x-request-id', reqId);

  const start = Date.now();
  const meta = {
    reqId,
    method: req.method,
    path: req.originalUrl || req.url,
    origin: req.headers.origin || '',
    ua: req.headers['user-agent'] || '',
  };
  console.log('[api:req:start]', JSON.stringify(meta));

  res.on('finish', () => {
    console.log('[api:req:end]', JSON.stringify({
      reqId,
      status: res.statusCode,
      durationMs: Date.now() - start,
      method: req.method,
      path: req.originalUrl || req.url,
    }));
  });
  next();
});

app.use(cors({
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
  credentials: true
}));

app.use(express.json())

app.get('/', (req, res) => {
  res.send("hello world")
})
// avaliable routes
app.use('/api/auth', require('./Routes/auth'))
app.use('/api/notes', require('./Routes/notes'))
app.use('/api/github', require('./Routes/github'))
app.use('/api/logs', require('./Routes/logs'))

app.listen(port, () => {
  console.log(`iNoteBook app listening on port ${port}`)
})
