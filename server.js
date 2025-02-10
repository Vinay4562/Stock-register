const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS setup
const corsOptions = {
  origin: ['http://localhost:8000', 'https://stock-register-git-main-vinay-kumars-projects-f1559f4a.vercel.app'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
};
app.use(cors(corsOptions));
app.use(morgan('dev'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use('/api/', limiter);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB Connection Error:", err));

// Use MongoDB as session store
app.use(session({
  secret: process.env.SESSION_SECRET || 'chantichitti2255@',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 1000 * 60 * 60 * 24, // 1 day
  },
}));

// MongoDB Schema
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

// User authentication (example)
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
  res.json({ loggedIn: !!req.session.user });
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

app.post('/api/materials', isAuthenticated, async (req, res) => {
  try {
    const newMaterial = new Material({
      ...req.body,
      dispatched: 0,
      remarks: req.body.remarks || ["Nil"],
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
  try {
    const material = await Material.findByIdAndUpdate(req.params.id, {
      ...req.body,
      lastUpdated: new Date(),
    }, { new: true });

    if (!material) {
      return res.status(404).json({ success: false, message: "Material not found" });
    }

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
