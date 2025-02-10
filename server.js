const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS setup to allow requests from localhost for local development
const corsOptions = {
  origin: ['http://localhost:8000', 'https://stock-register-git-main-vinay-kumars-projects-f1559f4a.vercel.app'], // Array of allowed origins
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true, // Allow cookies (sessions) to be sent
};

app.use(cors(corsOptions));
app.use(morgan('dev')); // Logging middleware
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting to prevent excessive API calls
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // Limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'chantichitti2255@',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Set to true in production
    httpOnly: true,
    sameSite: 'strict' // Add this to improve security
  }
}));

// MongoDB connection using environment variable
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.log("MongoDB Connection Error: ", err));

const MaterialSchema = new mongoose.Schema({
    name: String,
    type: String,
    stock: Number,
    dispatched: Number,
    remarks: [String],
    dispatchHistory: [
        {
            quantity: Number,
            date: Date,
            remarks: String
        }
    ],
    addedDate: {
        type: Date,
        default: Date.now,
        immutable: true
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

const Material = mongoose.model("Material", MaterialSchema);
module.exports = Material;

const users = [
  { username: 'Shankarpally400kv', password: bcrypt.hashSync('password123', 10) }
];

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username);

  if (user && await bcrypt.compare(password, user.password)) {
    req.session.user = username;
    res.json({ success: true, redirect: '/material_index.html' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

function isAuthenticated(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.status(403).json({ message: 'Unauthorized' });
  }
}

app.get('/check-login', (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true });
  } else {
    res.json({ loggedIn: false });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ message: 'Logout failed' });

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json({ success: true, redirect: '/login.html' });
  });
});

app.get('/api/materials', isAuthenticated, async (req, res) => {
  try {
    const materials = await Material.find();
    res.json(materials);
  } catch (err) {
    console.error("Error fetching materials:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/last-updated', isAuthenticated, async (req, res) => {
  try {
    const lastUpdated = await Material.findOne({}, {}, { sort: { updatedAt: -1 } }).select('updatedAt');
    if (!lastUpdated) {
      return res.status(404).json({ message: 'Last updated data not found' });
    }
    res.json({ lastUpdated: lastUpdated.updatedAt });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post('/api/materials', isAuthenticated, async (req, res) => {
  const { name, type, stock, remarks } = req.body;

  try {
    const newMaterial = new Material({
      name,
      type,
      stock,
      dispatched: 0,
      remarks: remarks || ["Nil"],
      addedDate: new Date(),
      lastUpdated: new Date()
    });

    await newMaterial.save();
    res.json({ success: true, material: newMaterial });
  } catch (err) {
    console.error("Error adding material:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/materials/:id', isAuthenticated, async (req, res) => {
  const { name, type, stock, dispatched, remarks, dispatchHistory } = req.body;

  try {
      const material = await Material.findById(req.params.id);

      if (!material) {
          return res.status(404).json({ success: false, message: "Material not found" });
      }

      material.name = name || material.name;
      material.type = type || material.type;
      material.stock = stock !== undefined ? stock : material.stock;
      material.dispatched = dispatched !== undefined ? dispatched : material.dispatched;
      material.remarks = remarks || material.remarks;
      material.dispatchHistory = dispatchHistory || material.dispatchHistory;
      
      material.lastUpdated = new Date();

      await material.save();
      res.json({ success: true, material });

  } catch (err) {
      console.error("Error updating material:", err);
      res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/materials/:id', isAuthenticated, async (req, res) => {
  try {
    await Material.findByIdAndDelete(req.params.id);
    res.json({ message: "Material deleted" });
  } catch (err) {
    res.status(500).send("Error deleting material: " + err.message);
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
