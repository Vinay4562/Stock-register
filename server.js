const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');  // ✅ Store sessions in MongoDB
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ✅ CORS Configuration
const corsOptions = {
  origin: ['http://localhost:8000', 'https://stock-register-git-main-vinay-kumars-projects-f1559f4a.vercel.app'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

const mongoURI = process.env.MONGODB_URI;

// ✅ Store sessions in MongoDB (NOT MemoryStore)
app.use(session({
  secret: process.env.SESSION_SECRET || 'chantichitti2255@',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: mongoURI }),
  cookie: { secure: false, httpOnly: true } // Secure=true only in production with HTTPS
}));

mongoose.connect(mongoURI)
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB Connection Error:", err));

// ✅ User Schema & Model (Replace Hardcoded Users)
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true }
});
const User = mongoose.model("User", UserSchema);

// ✅ Material Schema with timestamps
const MaterialSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  type: { type: String, required: true, trim: true, maxlength: 50 },
  stock: { type: Number, required: true, min: 0 },
  dispatched: { type: Number, default: 0, min: 0 },
  remarks: [{ text: String, date: { type: Date, default: Date.now } }],
  dispatchHistory: [
      {
          quantity: { type: Number, required: true, min: 1 },
          date: { type: Date, default: Date.now },
          remarks: String
      }
  ],
  addedDate: { type: Date, default: Date.now },  // ✅ Add this line
}, { timestamps: true });  // ✅ Automatically tracks createdAt and updatedAt

const Material = mongoose.model("Material", MaterialSchema);

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

    // Clear the cache and disable back navigation
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json({ success: true, redirect: '/login.html' });
  });
});

app.get('/api/materials', isAuthenticated, async (req, res) => {
  try {
    const materials = await Material.find();
    res.json(materials);  // Ensure that 'addedDate' is included in the response
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
      remarks: Array.isArray(remarks) ? remarks : [{ text: "Nil" }],
      addedDate: new Date(),  // ✅ Ensure correct date format
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

      // Do NOT change 'addedDate' on updates
      material.name = name || material.name;
      material.type = type || material.type;
      material.stock = stock !== undefined ? stock : material.stock;
      material.dispatched = dispatched !== undefined ? dispatched : material.dispatched;
      
      material.remarks = Array.isArray(remarks) && remarks.length > 0 
                         ? remarks.map(r => (typeof r === 'string' ? { text: r } : r)) 
                         : material.remarks; // Retain previous remarks if empty

      material.dispatchHistory = dispatchHistory || material.dispatchHistory;
      material.lastUpdated = new Date(); // Only update lastUpdated

      await material.save();
      res.json({ success: true, material });

  } catch (err) {
      console.error("Error updating material:", err);
      res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/materials/:id', isAuthenticated, async (req, res) => {
  try {
      const deletedMaterial = await Material.findByIdAndDelete(req.params.id);
      
      if (!deletedMaterial) {
          return res.status(404).json({ success: false, message: "Material not found" });
      }

      // Update the last updated timestamp for dashboard tracking
      await Material.updateMany({}, { $set: { lastUpdated: new Date() } });

      res.json({ success: true, message: "Material deleted successfully" });
  } catch (err) {
      console.error("Error deleting material:", err);
      res.status(500).json({ success: false, message: err.message });
  }
});


const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
