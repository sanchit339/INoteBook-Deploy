const connectToMongo = require("./db");
var cors = require('cors')


const express = require('express')
connectToMongo();

const app = express()
const port = process.env.PORT || 4001


app.use(cors({
  origin: "*",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'auth-token']
}));

// Handle preflight requests
app.options('*', cors());

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
