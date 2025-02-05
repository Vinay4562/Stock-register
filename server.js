const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS setup
const corsOptions = {
  origin: 'http://localhost:8000', // Adjust if frontend runs on a different port
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
};
app.use(cors(corsOptions));

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'mysecret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' } // Secure in production
}));

// MongoDB connection
const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true, 
  useFindAndModify: false
})
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.log("MongoDB Connection Error: ", err));

// User schema
const userSchema = new mongoose.Schema({
  username: String,
  password: String,
});
const User = mongoose.model('User', userSchema);

// Material schema
const materialSchema = new mongoose.Schema({
  name: String,
  type: String,
  stock: Number,
  dispatched: Number,
  remarks: [String],
  lastUpdated: { type: Date, default: Date.now },
});
const Material = mongoose.model('Material', materialSchema);

// Register user (For testing - Remove in production)
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = new User({ username, password: hashedPassword });
  await newUser.save();
  res.json({ success: true, message: "User registered" });
});

// Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });

  if (user && await bcrypt.compare(password, user.password)) {
    req.session.user = username;
    res.json({ success: true, redirect: '/material_index.html' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// Authentication middleware
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.status(403).json({ message: 'Unauthorized' });
  }
}

// Check login status
app.get('/check-login', (req, res) => {
  res.json({ loggedIn: !!req.session.user });
});

// Logout
app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ message: 'Logout failed' });
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json({ success: true, redirect: '/login.html' });
  });
});

// Fetch materials
app.get('/api/materials', isAuthenticated, async (req, res) => {
  try {
    const materials = await Material.find();
    res.json(materials);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get last updated timestamp
app.get('/api/last-updated', isAuthenticated, async (req, res) => {
  try {
    const lastUpdated = await Material.findOne({}, {}, { sort: { lastUpdated: -1 } }).select('lastUpdated');
    if (!lastUpdated) {
      return res.status(404).json({ message: 'Last updated data not found' });
    }
    res.json({ lastUpdated: lastUpdated.lastUpdated });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// Add material
app.post('/api/materials', isAuthenticated, async (req, res) => {
  try {
    const newMaterial = new Material(req.body);
    await newMaterial.save();
    res.json(newMaterial);
  } catch (err) {
    res.status(500).send("Error saving material: " + err.message);
  }
});

// Update material
app.put('/api/materials/:id', isAuthenticated, async (req, res) => {
  try {
    const material = await Material.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!material) return res.status(404).json({ message: "Material not found" });
    res.json(material);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete material
app.delete('/api/materials/:id', isAuthenticated, async (req, res) => {
  try {
    const material = await Material.findByIdAndDelete(req.params.id);
    if (!material) return res.status(404).json({ message: "Material not found" });
    res.json({ message: "Material deleted" });
  } catch (err) {
    res.status(500).send("Error deleting material: " + err.message);
  }
});

// Start server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
