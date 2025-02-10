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

// ✅ **CORS Setup**
const corsOptions = {
  origin: ['http://localhost:8000', 'https://stock-register-git-main-vinay-kumars-projects-f1559f4a.vercel.app'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
};
app.use(cors(corsOptions));

// ✅ **Logger Middleware**
app.use(morgan('dev'));

// ✅ **Rate Limiting**
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});
app.use('/api/', limiter);

// ✅ **MongoDB Connection**
const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));


// ✅ **Use `connect-mongo` for Session Storage**
app.use(session({
  secret: process.env.SESSION_SECRET || 'chantichitti2255@',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: mongoURI,
    ttl: 14 * 24 * 60 * 60 // Save sessions for 14 days
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict'
  }
}));

// ✅ **Material Schema**
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

// ✅ **Create Index for Faster Queries**
MaterialSchema.index({ name: 1 });
const Material = mongoose.model("Material", MaterialSchema);

// ✅ **User Authentication**
const users = [{ username: 'Shankarpally400kv', password: bcrypt.hashSync('password123', 10) }];

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

// ✅ **Auth Middleware**
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

// ✅ **Fetch Materials (Optimized)**
app.get('/api/materials', isAuthenticated, async (req, res) => {
  try {
    const materials = await Material.find().select("name stock lastUpdated").limit(100);
    res.json(materials);
  } catch (err) {
    console.error("❌ Error fetching materials:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ **Get Last Updated Material**
app.get('/api/last-updated', isAuthenticated, async (req, res) => {
  try {
    const lastUpdated = await Material.findOne({}, {}, { sort: { lastUpdated: -1 } }).select('lastUpdated');
    if (!lastUpdated) return res.status(404).json({ message: 'No materials found' });
    res.json({ lastUpdated: lastUpdated.lastUpdated });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// ✅ **Add Material**
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
    console.error("❌ Error adding material:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ **Update Material**
app.put('/api/materials/:id', isAuthenticated, async (req, res) => {
  const { name, type, stock, dispatched, remarks, dispatchHistory } = req.body;
  try {
    const material = await Material.findById(req.params.id);
    if (!material) return res.status(404).json({ success: false, message: "Material not found" });

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
    console.error("❌ Error updating material:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ **Delete Material**
app.delete('/api/materials/:id', isAuthenticated, async (req, res) => {
  try {
    await Material.findByIdAndDelete(req.params.id);
    res.json({ message: "Material deleted" });
  } catch (err) {
    res.status(500).send("Error deleting material: " + err.message);
  }
});

// ✅ **Server Start**
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
