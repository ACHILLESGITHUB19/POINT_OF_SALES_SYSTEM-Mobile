import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// Use the environment variable
const MONGO_URI = process.env.MONGODB_URI;

export const connectDB = async () => {
  try {
    if (!MONGO_URI) {
      throw new Error("MONGODB_URI is not defined in environment variables");
    }
    
    console.log("Connecting to MongoDB Atlas...");
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000, // Increased timeout for Atlas
      socketTimeoutMS: 45000,
    }); 
    
    console.log(" MongoDB Atlas connected successfully");
    console.log(`Database: ${mongoose.connection.db.databaseName}`);
    console.log(`Host: ${mongoose.connection.host}`);
    
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    console.error("Connection string:", MONGO_URI ? "***[HIDDEN]***" : "Not defined");
    process.exit(1); 
  }
};

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
    },
    role: {
      type: String,
      enum: ["admin", "staff"],
      default: "staff",
    },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);


const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      unique: true,
      trim: true,
    },
  },
  { timestamps: true }
);

export const Category = mongoose.model("Category", categorySchema);


const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: false,
    },
    price: {
      type: Number,
      required: [true, "Product price is required"],
      min: 0,
    },
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    image: { type: String,
    default: '' 
    },
  },
  { timestamps: true }
);

export const Product = mongoose.model("Product", productSchema);


const orderSchema = new mongoose.Schema({
  items: [
    {
      name: String,
      price: Number,
      quantity: Number,
      size: String,
      image: String, 
    }
  ],
  subtotal: Number,
  tax: Number,
  total: Number,
  type: String, 
  customer: {
    name: {
      type: String,
      default: 'Guest'
    },
    phone: {
      type: String,
      default: 'N/A'
    }
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

export const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);


const StatsSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true,
    default: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today;
    }
  },
  
  totalOrders: {
    type: Number,
    default: 0
  },
  ordersToday: {
    type: Number,
    default: 0
  },
  
  itemsSold: {
    type: Number,
    default: 0
  },
  itemsSoldToday: {
    type: Number,
    default: 0
  },
  
  dineInOrders: {
    type: Number,
    default: 0
  },
  takeoutOrders: {
    type: Number,
    default: 0
  },
  
  categoryStats: {
    Rice: { type: Number, default: 0 },
    Sizzling: { type: Number, default: 0 },
    Party: { type: Number, default: 0 },
    Drink: { type: Number, default: 0 },
    Cafe: { type: Number, default: 0 },
    Milk: { type: Number, default: 0 },
    Frappe: { type: Number, default: 0 }
  },
  
  topProducts: [{
    name: String,
    quantity: Number,
  }],
  
  hourlyStats: {
    0: { type: Number, default: 0 },
    1: { type: Number, default: 0 },
    2: { type: Number, default: 0 },
    3: { type: Number, default: 0 },
    4: { type: Number, default: 0 },
    5: { type: Number, default: 0 },
    6: { type: Number, default: 0 },
    7: { type: Number, default: 0 },
    8: { type: Number, default: 0 },
    9: { type: Number, default: 0 },
    10: { type: Number, default: 0 },
    11: { type: Number, default: 0 },
    12: { type: Number, default: 0 },
    13: { type: Number, default: 0 },
    14: { type: Number, default: 0 },
    15: { type: Number, default: 0 },
    16: { type: Number, default: 0 },
    17: { type: Number, default: 0 },
    18: { type: Number, default: 0 },
    19: { type: Number, default: 0 },
    20: { type: Number, default: 0 },
    21: { type: Number, default: 0 },
    22: { type: Number, default: 0 },
    23: { type: Number, default: 0 }
  },
  
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

StatsSchema.statics.updateStats = async function(orderData) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let stats = await this.findOne({ date: today });
  
  if (!stats) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStats = await this.findOne({ date: yesterday });
    
    stats = new this({
      date: today,
      totalOrders: yesterdayStats ? yesterdayStats.totalOrders : 0,
      itemsSold: yesterdayStats ? yesterdayStats.itemsSold : 0,
      dineInOrders: yesterdayStats ? yesterdayStats.dineInOrders : 0,
      takeoutOrders: yesterdayStats ? yesterdayStats.takeoutOrders : 0,
      categoryStats: yesterdayStats ? yesterdayStats.categoryStats : {
        Rice: 0, Sizzling: 0, Party: 0, Drink: 0, 
        Cafe: 0, Milk: 0, Frappe: 0
      }
    });
  }
  
  const hour = new Date().getHours();
  
  stats.totalOrders += 1;
  stats.ordersToday += 1;
  
  const itemsInOrder = orderData.items.reduce((sum, item) => sum + item.quantity, 0);
  stats.itemsSold += itemsInOrder;
  stats.itemsSoldToday += itemsInOrder;
  
  if (orderData.type === 'Dine In') {
    stats.dineInOrders += 1;
  } else if (orderData.type === 'Take Out') {
    stats.takeoutOrders += 1;
  }
  
  stats.hourlyStats[hour] = (stats.hourlyStats[hour] || 0) + 1;
  
  orderData.items.forEach(item => {
    const itemName = item.name.toLowerCase();
    if (itemName.includes('bulgogi') || itemName.includes('lechon') || 
        itemName.includes('chicken') || itemName.includes('adobo') || 
        itemName.includes('shanghai') || itemName.includes('fish') || 
        itemName.includes('dory') || itemName.includes('pork')) {
      stats.categoryStats.Rice += item.quantity;
    } else if (itemName.includes('sizzling') || itemName.includes('sisig') || 
               itemName.includes('liempo') || itemName.includes('porkchop')) {
      stats.categoryStats.Sizzling += item.quantity;
    } else if (itemName.includes('pancit') || itemName.includes('spaghetti') || 
               itemName.includes('party')) {
      stats.categoryStats.Party += item.quantity;
    } else if (itemName.includes('lemonade') || itemName.includes('soda') || 
               itemName.includes('red tea') && !itemName.includes('milk')) {
      stats.categoryStats.Drink += item.quantity;
    } else if (itemName.includes('cafe') || itemName.includes('americano') || 
               itemName.includes('latte') || itemName.includes('macchiato') || 
               itemName.includes('coffee')) {
      stats.categoryStats.Cafe += item.quantity;
    } else if (itemName.includes('milk tea') || itemName.includes('matcha green tea')) {
      stats.categoryStats.Milk += item.quantity;
    } else if (itemName.includes('frappe') || itemName.includes('cookies & cream')) {
      stats.categoryStats.Frappe += item.quantity;
    }
  });
  
  orderData.items.forEach(item => {
    const existingProduct = stats.topProducts.find(p => p.name === item.name);
    if (existingProduct) {
      existingProduct.quantity += item.quantity;
    } else {
      stats.topProducts.push({
        name: item.name,
        quantity: item.quantity,
      });
    }
  });
  
  stats.topProducts.sort((a, b) => b.quantity - a.quantity);
  stats.topProducts = stats.topProducts.slice(0, 10);
  
  stats.lastUpdated = new Date();
  await stats.save();
  
  return stats;
};

StatsSchema.statics.getDashboardStats = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const stats = await this.findOne({ date: today });
  
  if (!stats) {
    return {
      totalOrders: 0,
      totalProducts: 0,
      totalStocks: 0,
      ordersToday: 0,
      itemsSoldToday: 0,
      dineInToday: 0,
      takeoutToday: 0,
      categoryStats: {
        Rice: 0, Sizzling: 0, Party: 0, Drink: 0, 
        Cafe: 0, Milk: 0, Frappe: 0
      },
      hourlyStats: {},
      topProducts: []
    };
  }
  
  const uniqueProducts = stats.topProducts.length;
  
  return {
    totalOrders: stats.totalOrders,
    totalProducts: uniqueProducts,
    totalStocks: stats.itemsSold,
    ordersToday: stats.ordersToday,
    itemsSoldToday: stats.itemsSoldToday,
    dineInToday: stats.dineInOrders,
    takeoutToday: stats.takeoutOrders,
    categoryStats: stats.categoryStats,
    hourlyStats: stats.hourlyStats,
    topProducts: stats.topProducts
  };
};

export const Stats = mongoose.models.Stats || mongoose.model("Stats", StatsSchema);