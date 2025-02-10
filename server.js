const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS setup
const corsOptions = {
  origin: ['http://localhost:8000', 'https://your-frontend-domain.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
};
app.use(cors(corsOptions));

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'chantichitti2255@',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict'
  }
}));

const users = [
  { username: 'Shankarpally400kv', password: bcrypt.hashSync('password123', 10) }
];

// MongoDB Connection
const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => {
    console.error("MongoDB Connection Error:", err);
    process.exit(1);
  });

// Material Schema
const MaterialSchema = new mongoose.Schema({
  name: String,
  type: String,
  stock: Number,
  dispatched: Number,
  remarks: [String],
  dispatchHistory: [{
    quantity: Number,
    date: Date,
    remarks: String
  }],
  addedDate: { type: Date, default: Date.now, immutable: true },
}, { timestamps: true });

const Material = mongoose.model("Material", MaterialSchema);

// User Schema (Instead of in-memory array)
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String
});
const User = mongoose.model("User", UserSchema);

// Authentication Middleware
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.status(403).json({ message: 'Unauthorized' });
  }
}

// User Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  
  if (user && bcrypt.compareSync(password, user.password)) {
    req.session.user = username;
    res.json({ success: true, redirect: '/material_index.html' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// Check Login Status
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

// Get Materials
app.get('/api/materials', isAuthenticated, async (req, res) => {
  try {
    const materials = await Material.find();
    res.json(materials);
  } catch (err) {
    console.error("Error fetching materials:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get Last Updated Material
app.get('/api/last-updated', isAuthenticated, async (req, res) => {
  try {
    const lastUpdated = await Material.findOne({}, {}, { sort: { updatedAt: -1 } }).select('updatedAt');
    if (!lastUpdated) return res.status(404).json({ message: 'No data found' });
    res.json({ lastUpdated: lastUpdated.updatedAt });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// Add Material
app.post('/api/materials', isAuthenticated, async (req, res) => {
  try {
    const { name, type, stock, remarks } = req.body;
    const newMaterial = new Material({
      name,
      type,
      stock,
      dispatched: 0,
      remarks: remarks || ["Nil"],
    });
    await newMaterial.save();
    res.json({ success: true, material: newMaterial });
  } catch (err) {
    console.error("Error adding material:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update Material
app.put('/api/materials/:id', isAuthenticated, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid material ID" });
  }
  try {
    const material = await Material.findById(req.params.id);
    if (!material) return res.status(404).json({ success: false, message: "Material not found" });
    
    Object.assign(material, req.body, { lastUpdated: new Date() });
    await material.save();
    res.json({ success: true, material });
  } catch (err) {
    console.error("Error updating material:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete Material
app.delete('/api/materials/:id', isAuthenticated, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid material ID" });
  }
  try {
    await Material.findByIdAndDelete(req.params.id);
    res.json({ message: "Material deleted" });
  } catch (err) {
    res.status(500).send("Error deleting material: " + err.message);
  }
});

// Start Server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
