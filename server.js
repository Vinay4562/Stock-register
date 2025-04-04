const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const MongoStore = require('connect-mongo');  // ✅ Store sessions in MongoDB
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});

app.use(limiter);

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
  remarks: [
      {
          text: { type: String, required: true }, // Remark text
          date: { type: Date, default: Date.now }, // Date of the remark
      },
  ],
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

// Load default credentials from .env
const users = [
  { username: process.env.DEFAULT_USERNAME, password: process.env.DEFAULT_PASSWORD_HASH }
];

// Validate credentials are loaded
if (!users[0].username || !users[0].password) {
  console.error('Error: DEFAULT_USERNAME or DEFAULT_PASSWORD_HASH not set in .env');
  process.exit(1);
}

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
    // Find the material with the most recent `updatedAt` timestamp
    const lastUpdatedMaterial = await Material.findOne({}, {}, { sort: { updatedAt: -1 } }).select('updatedAt');

    if (!lastUpdatedMaterial) {
      return res.status(404).json({ message: 'No materials found' });
    }

    // Send the last updated timestamp
    res.json({ lastUpdated: lastUpdatedMaterial.updatedAt });
  } catch (error) {
    console.error("Error fetching last updated timestamp:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post('/api/materials', isAuthenticated, async (req, res) => {
  const { name, type, stock, remarks } = req.body;

  try {
    // Ensure remarks is an array of objects
    const formattedRemarks = Array.isArray(remarks)
      ? remarks.map(r => ({ text: r.text || r, date: new Date() })) // Handle both string and object remarks
      : [{ text: remarks || "Nil", date: new Date() }]; // Default remark if none provided

    const newMaterial = new Material({
      name,
      type,
      stock,
      dispatched: 0,
      remarks: formattedRemarks,
      addedDate: new Date(),
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

      // Update the last updated timestamp for tracking latest modification
      const latestUpdate = new Date();
      await Material.updateMany({}, { $set: { lastUpdated: latestUpdate } });

      res.json({ success: true, message: "Material deleted successfully", lastUpdated: latestUpdate });
  } catch (err) {
      console.error("Error deleting material:", err);
      res.status(500).json({ success: false, message: err.message });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});