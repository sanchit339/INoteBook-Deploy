const connectToMongo = require("./db");
var cors = require('cors')


const express = require('express')
connectToMongo();

const app = express()
const port = process.env.PORT || 4001

const allowedOrigins = [
  'https://i-note-book-deploy-frontend.vercel.app',
  'https://i-note-book-deploy.vercel.app',
  'http://localhost:3000'
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser clients and same-origin requests with no Origin header
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('CORS not allowed for this origin'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'auth-token']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json())

app.get('/', (req, res) => {
  res.send("hello world")
})
// avaliable routes
app.use('/api/auth', require('./Routes/auth'))
app.use('/api/notes', require('./Routes/notes'))
app.use('/api/github', require('./Routes/github'))

app.listen(port, () => {
  console.log(`iNoteBook app listening on port ${port}`)
})
