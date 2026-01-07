import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path from "path";

import { connectDB, User, Product, Category, Order, Stats } from "./config/database.js";
import categoryRoutes from "./routes/categoryroute.js";
import productRoutes from "./routes/productroute.js";

dotenv.config();
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET not defined in .env");
}

const app = express();
await connectDB();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(process.cwd(), "public")));
app.use('/images', express.static(path.join(process.cwd(), "images")));
app.set("view engine", "ejs");

app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);

const pages = ["login", "register", "order"];
pages.forEach(page => {
  app.get(`/${page.toLowerCase()}`, (req, res) => res.render(page));
});

const verifyToken = (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.redirect("/login");

    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    console.error("Token verification failed:", err);
    res.clearCookie("token");
    res.redirect("/login");
  }
};

app.get('/', (req, res) => {
  res.redirect('/login')
});

app.post("/register", async (req, res) => {
  try {
    const { user, pass, role } = req.body;
    if (!user || !pass) return res.status(400).json({ message: "Username and password required" });

    const existingUser = await User.findOne({ username: user });
    if (existingUser) return res.status(409).json({ message: "User already exists" });

    const hashedPassword = bcrypt.hashSync(pass, 10);
    const newUser = new User({ username: user, password: hashedPassword, role: role || "staff" });

    await newUser.save();
    res.status(201).json({ message: "Username registered successfully" });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { user, pass } = req.body;

    const existingUser = await User.findOne({ username: user });
    if (!existingUser) return res.status(404).send("User not found");

    const isMatch = bcrypt.compareSync(pass, existingUser.password);
    if (!isMatch) return res.status(401).send("Invalid password");

    const token = jwt.sign(
      { id: existingUser._id, username: existingUser.username, role: existingUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "365d" }
    );

    res.cookie("token", token, { httpOnly: true, sameSite: "strict", maxAge: 1000*60*60*24*365 });

    if (existingUser.role === "admin") return res.redirect("/admindashboard");
    res.redirect("/staffdashboard");
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).send("Login error");
  }
});
app.post('/api/orders', async (req, res) => {
  try {
    const orderData = req.body;
    
    // Validate required data
    if (!orderData.items || !orderData.items.length) {
      return res.status(400).json({ 
        success: false, 
        message: "No items in order" 
      });
    }
    
    if (!orderData.total) {
      return res.status(400).json({ 
        success: false, 
        message: "Total amount is required" 
      });
    }
    
    // Ensure order has a type
    if (!orderData.type) {
      orderData.type = "Dine In"; // default
    }
    
    // Create order with all necessary fields
    const order = new Order({
      items: orderData.items.map(item => ({
        name: item.name || "Unknown Item",
        price: item.price || 0,
        quantity: item.quantity || 1,
        image: item.image || 'default_food.jpg'
      })),
      subtotal: orderData.subtotal || 0,
      tax: orderData.tax || 0,
      total: orderData.total,
      type: orderData.type,
      customer: {
        name: orderData.customer?.name || "Guest",
        phone: orderData.customer?.phone || "N/A"
      },
      status: "completed", // Mark as paid
      paymentStatus: "paid", // Explicit payment status
      date: new Date()
    });
    
    // Save to database
    const savedOrder = await order.save();
    console.log('Order saved to MongoDB:', savedOrder._id);
    
    try {
      if (Stats && typeof Stats.updateStats === 'function') {
        await Stats.updateStats(orderData);
      }
    } catch (statsError) {
      console.error('Stats update error (non-critical):', statsError);
    }
    
    res.json({ 
      success: true, 
      orderId: savedOrder._id,
      message: "Payment and order processed successfully"
    });
    
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to save order to database"
    });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const stats = await Stats.getDashboardStats();
    res.json(stats);
  } catch (error) {
    console.error('Stats fetch error:', error);
    res.status(500).json({ 
      error: error.message 
    });
  }
});


async function initializeDatabase() {
  try {
    const categoryCount = await Category.countDocuments();
    
    if (categoryCount === 0) {
      console.log("Initializing database with default categories...");
      
      const defaultCategories = [
        "Rice", "Sizzling", "Party", "Drink", "Cafe", "Milk", "Frappe", 
        "Snack & Appetizer", "Budget Meals Served with Rice", "Specialties"
      ];
      
      for (const catName of defaultCategories) {
        await Category.findOneAndUpdate(
          { name: catName },
          { $setOnInsert: { name: catName } },
          { upsert: true, new: true }
        );
      }
      
      console.log("Default categories created.");
    }
    
    const adminCount = await User.countDocuments({ role: "admin" });
    
    if (adminCount === 0) {
      const adminUser = new User({
        username: "admin",
        password: bcrypt.hashSync("admin123", 10),
        role: "admin"
      });
      
      await adminUser.save();
      console.log("Default admin user created: admin / admin123");
    }
    
    const staffCount = await User.countDocuments({ role: "staff" });
    
    if (staffCount === 0) {
      const staffUser = new User({
        username: "staff",
        password: bcrypt.hashSync("staff123", 10),
        role: "staff"
      });
      await staffUser.save();
      console.log("Default staff user created: staff / staff123");
    }
    
    const productCount = await Product.countDocuments();
    
    if (productCount === 0) {
      const categories = await Category.find();
      const categoryMap = {};
      categories.forEach(cat => {
        categoryMap[cat.name] = cat._id;
      });
      
      const defaultProducts = [
        { name: "Korean Spicy Bulgogi (Pork)", price: 158, category: "Rice", image: "korean_spicy_bulgogi.jpg" },
        { name: "Korean Salt and Pepper (Pork)", price: 158, category: "Rice", image: "korean_salt_pepper_pork.jpg" },
        { name: "Crispy Pork Lechon Kawali", price: 158, category: "Rice", image: "lechon_kawali.jpg" },
        { name: "Cream Dory Fish Fillet", price: 138, category: "Rice", image: "cream_dory.jpg" },
        { name: "Buttered Honey Chicken", price: 128, category: "Rice", image: "buttered_honey_chicken.jpg" },
        { name: "Buttered Spicy Chicken", price: 128, category: "Rice", image: "buttered_spicy_chicken.jpg" },
        { name: "Chicken Adobo", price: 128, category: "Rice", image: "chicken_adobo.jpg" },
        { name: "Pork Shanghai", price: 128, category: "Rice", image: "pork_shanghai.jpg" },
        
        { name: "Sizzling Pork Sisig", price: 168, category: "Sizzling", image: "pork_sisig.jpg" },
        { name: "Sizzling Liempo", price: 168, category: "Sizzling", image: "liempo.jpg" },
        { name: "Sizzling Porkchop", price: 148, category: "Sizzling", image: "porkchop.jpg" },
        { name: "Sizzling Fried Chicken", price: 148, category: "Sizzling", image: "fried_chicken.jpg" },
        
        { name: "Pancit Bihon (S)", price: 300, category: "Party", image: "pancit_bihon_small.jpg" },
        { name: "Pancit Bihon (M)", price: 500, category: "Party", image: "pancit_bihon_medium.jpg" },
        { name: "Pancit Bihon (L)", price: 700, category: "Party", image: "pancit_bihon_large.jpg" },
        { name: "Pancit Canton (S)", price: 300, category: "Party", image: "pancit_canton_small.jpg" },
        { name: "Pancit Canton (M)", price: 500, category: "Party", image: "pancit_canton_medium.jpg" },
        { name: "Pancit Canton (L)", price: 700, category: "Party", image: "pancit_canton_large.jpg" },
        { name: "Spaghetti (S)", price: 400, category: "Party", image: "spaghetti_small.jpg" },
        { name: "Spaghetti (M)", price: 700, category: "Party", image: "spaghetti_medium.jpg" },
        { name: "Spaghetti (L)", price: 1000, category: "Party", image: "spaghetti_large.jpg" },
        
        { name: "Cucumber Lemonade (Glass)", price: 38, category: "Drink", image: "cucumber_lemonade.jpg" },
        { name: "Cucumber Lemonade (Pitcher)", price: 108, category: "Drink", image: "cucumber_lemonade_pitcher.jpg" },
        { name: "Blue Lemonade (Glass)", price: 38, category: "Drink", image: "blue_lemonade.jpg" },
        { name: "Blue Lemonade (Pitcher)", price: 108, category: "Drink", image: "blue_lemonade_pitcher.jpg" },
        { name: "Red Tea (Glass)", price: 38, category: "Drink", image: "red_tea.jpg" },
        { name: "Soda (Mismo)", price: 28, category: "Drink", image: "soda.jpg" },
        { name: "Soda 1.5L", price: 118, category: "Drink", image: "soda_1.5L.jpg" },
        
        { name: "Cafe Americano Tall", price: 88, category: "Cafe", image: "cafe_americano.jpg" },
        { name: "Cafe Americano Grande", price: 108, category: "Cafe", image: "cafe_americano_grande.jpg" },
        { name: "Cafe Latte Tall", price: 108, category: "Cafe", image: "cafe_latte.jpg" },
        { name: "Cafe Latte Grande", price: 128, category: "Cafe", image: "cafe_latte_grande.jpg" },
        { name: "Caramel Macchiato Tall", price: 108, category: "Cafe", image: "caramel_macchiato.jpg" },
        { name: "Caramel Macchiato Grande", price: 128, category: "Cafe", image: "caramel_macchiato_grande.jpg" },
        
        { name: "Milk Tea Regular HC", price: 68, category: "Milk", image: "milk_tea.jpg" },
        { name: "Milk Tea Regular MC", price: 88, category: "Milk", image: "milk_tea_mc.jpg" },
        { name: "Matcha Green Tea HC", price: 78, category: "Milk", image: "matcha_green_tea.jpg" },
        { name: "Matcha Green Tea MC", price: 88, category: "Milk", image: "matcha_green_tea_mc.jpg" },
        
       
        { name: 'Matcha Green Tea HC', price: 108, category: 'Frappe', image: 'matcha_frappe.png' },
        { name: 'Matcha Green Tea MC', price: 138, category: 'Frappe', image: 'matcha_frappe_mc.png' },
        { name: 'Cookies & Cream HC', price: 98, category: 'Frappe', image: 'cookies_cream_frappe.png' },
        { name: 'Cookies & Cream MC', price: 128, category: 'Frappe', image: 'cookies_cream_frappe_mc.png' },
        { name: 'Strawberry&Cream HC', price: 180, category: 'Frappe', image: 'Strawberr_Cream_frappe_HC.png'},

        { name: "Cheesy Nachos", price: 88, category: "Snack & Appetizer", image: "cheesy_nachos.jpg" },
        { name: "Nachos Supreme", price: 108, category: "Snack & Appetizer", image: "nachos_supreme.jpg" },
        { name: "French fries", price: 58, category: "Snack & Appetizer", image: "french_fries.jpg" },
        { name: "Clubhouse Sandwich", price: 118, category: "Snack & Appetizer", image: "clubhouse_sandwich.jpg" },
        { name: "Fish and Fries", price: 128, category: "Snack & Appetizer", image: "fish_fries.jpg" },
        { name: "Cheesy Dynamite Lumpia", price: 88, category: "Snack & Appetizer", image: "cheesy_dynamite.jpg" },

        { name: "Fried Chicken", price: 78, category: "Budget Meals Served with Rice", image: "fried_chicken_meal.jpg" },
        { name: "Buttered Honey Chicken", price: 78, category: "Budget Meals Served with Rice", image: "buttered_honey_chicken_meal.jpg" },
        { name: "Buttered Spicy Chicken", price: 78, category: "Budget Meals Served with Rice", image: "buttered_spicy_chicken_meal.jpg" },
        { name: "Tinapa Rice", price: 108, category: "Budget Meals Served with Rice", image: "tinapa_rice.jpg" },
        { name: "Fried Rice", price: 128, category: "Budget Meals Served with Rice", image: "fried_rice.jpg" },
        { name: "Plain Rice", price: 18, category: "Budget Meals Served with Rice", image: "plain_rice.jpg" },

        { name: "Sinigang (PORK)", price: 188, category: "Specialties", image: "sinigang_pork.jpg" },
        { name: "Sinigang (Shrimp)", price: 178, category: "Specialties", image: "sinigang_shrimp.jpg" },
        { name: "Paknet (Pakbet w/ Bagnet)", price: 188, category: "Specialties", image: "pakbet_bagnet.jpg" },
        { name: "Buttered Shrimp", price: 108, category: "Specialties", image: "buttered_shrimp.jpg" },
        { name: "Special Bulalo (good for 2-3 Persons)", price: 128, category: "Specialties", image: "bulalo.jpg" },
        { name: "Special Bulalo Buy 1 Take 1 (good for 6-8 Persons)", price: 18, category: "Specialties", image: "bulalo_buy1take1.jpg" }
      ];
      
      for (const product of defaultProducts) {
        await Product.findOneAndUpdate(
          { name: product.name },
          { 
            name: product.name,
            price: product.price,
            category: categoryMap[product.category] || null,
            stock: 100,
            image: product.image || ''
          },
          { upsert: true }
        );
      }
      
      console.log(`Created ${defaultProducts.length} default products.`);
    }
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}   

await initializeDatabase();

app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find()
      .populate('category', 'name')
      .lean();
    
    const formattedProducts = products.map(product => ({
      id: product._id,
      name: product.name,
      price: product.price,
      category: product.category ? product.category.name : 'Uncategorized',
      stock: product.stock,
      image: product.image || 'default_food.jpg'
    }));
    
    res.json(formattedProducts);
  } catch (error) {
    console.error('Products fetch error:', error);
    res.status(500).json({ 
      error: error.message 
    });
  }
});

app.post('/api/products/:id/image', async (req, res) => {
  try {
    const { id } = req.params;
    const { image } = req.body;
    
    const product = await Product.findByIdAndUpdate(
      id,
      { image },
      { new: true }
    );
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json({ success: true, product });
  } catch (error) {
    console.error('Product image update error:', error);
    res.status(500).json({ 
      error: error.message 
    });
  }
});

app.get("/admindashboard", verifyToken, async (req, res) => {
  if (req.user.role !== "admin") return res.redirect("/staffdashboard");

  try {
    const totalProducts = await Product.countDocuments();
    const products = await Product.find({}, "stock").lean();
    const totalStocks = products.reduce((sum, p) => sum + (p.stock || 0), 0);
    const totalOrders = await Order.countDocuments();

    res.render("admindashboard", { user: req.user, stats: { totalProducts, totalStocks, totalOrders } });
  } catch (err) {
    console.error("ADMIN DASHBOARD ERROR:", err);
    res.render("admindashboard", { user: req.user, stats: { totalProducts: 0, totalStocks: 0, totalOrders: 0 } });
  }
});

app.get("/staffdashboard", verifyToken, async (req, res, next) => {
  try {
    if (req.user.role !== "staff") return res.redirect("/admindashboard");

    const products = await Product.find().populate("category", "name").lean();

    const categories = [
      ...new Set(products.map(p => (p.category && p.category.name) ? p.category.name : "Uncategorized"))
    ];

    res.render("staffdashboard", {
      user: req.user,
      products,
      categories
    });
  } catch (err) {
    console.error("STAFF DASHBOARD ERROR:", err);
    next(err);
  }
});

app.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/login");
});

app.post("/printreceipt", async (req, res, next) => {
  try {
    const { cart, orderType } = req.body;
    if (!cart || !cart.length) return res.status(400).json({ error: "Empty cart" });

    const receiptId = Date.now();
    res.json({ receiptId, cart, orderType });
  } catch (err) {
    next(err);
  }
});

app.use((req, res, next) => {
  res.status(404).send("Page not found");
});

app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);
  res.status(500).json({ status: "error", message: err.message });
});

const PORT = process.env.PORT || 9090;
app.listen(PORT, () => console.log(`Server is running at http://localhost:${PORT}`));