const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

const db = new sqlite3.Database("roomrevamp.db", (err) => {
  if (err) {
    console.error("Error connecting to SQLite:", err.message);
  } else {
    console.log("Connected to SQLite");
    createTables();
  }
});

// Create tables
const createTables = () => {
  db.run(`
    CREATE TABLE IF NOT EXISTS institutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      location TEXT
    )`, (err) => {
    if (err) console.error("Error creating institutions table:", err.message);
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      email TEXT UNIQUE,
      password TEXT,
      hostel_name TEXT,
      student_id TEXT UNIQUE,
      role TEXT,
      institution_id INTEGER,
      FOREIGN KEY(institution_id) REFERENCES institutions(id)
    )`, (err) => {
    if (err) console.error("Error creating users table:", err.message);
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id INTEGER,
      product_id TEXT,
      name TEXT,
      description TEXT,
      price REAL,
      photo TEXT,
      is_sold INTEGER DEFAULT 0,
      student_id TEXT,
      FOREIGN KEY(seller_id) REFERENCES users(id)
    )`, (err) => {
    if (err) console.error("Error creating products table:", err.message);
  });
};

// Institution Registration
app.post("/api/register-institution", (req, res) => {
  const { name, location, warden_email, warden_password } = req.body;
  const hashedPassword = bcrypt.hashSync(warden_password, 10);

  db.run("INSERT INTO institutions (name, location) VALUES (?,?)",
    [name, location], function (err) {
      if (err) return res.status(500).json({ message: "Error registering institution" });

      const institution_id = this.lastID;
      db.run("INSERT INTO users (username, email, password, role, institution_id) VALUES (?,?,?,?,?)",
        ["Warden", warden_email, hashedPassword, "warden", institution_id],
        (err) => {
          if (err) return res.status(500).json({ message: "Error registering warden" });
          res.json({ message: "Institution and Warden Registered Successfully" });
        }
      );
    }
  );
});

// User Registration
app.post("/api/register", async (req, res) => {
  const { username, email, password, hostel_name, student_id, role, institution_id } = req.body;

  db.get("SELECT * FROM users WHERE email = ? OR student_id = ?", [email, student_id], async (err, user) => {
    if (err) return res.status(500).json({ message: "Database error" });

    if (user) return res.status(400).json({ message: "Email or Student ID already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    db.run("INSERT INTO users (username, email, password, hostel_name, student_id, role, institution_id) VALUES (?,?,?,?,?,?,?)",
      [username, email, hashedPassword, hostel_name, student_id, role, institution_id],
      (err) => {
        if (err) return res.status(500).json({ message: "Error registering user" });
        res.json({ message: "User Registered" });
      }
    );
  });
});

// User Login
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (err) return res.status(500).json({ message: "Database error" });

    if (!user) return res.status(400).json({ message: "Invalid Credentials" });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ message: "Invalid Credentials" });

    const token = jwt.sign({ id: user.id, role: user.role, institution_id: user.institution_id }, "secret", { expiresIn: "1d" });

    res.json({ token, user });
  });
});

// Product Listing
const upload = multer({ dest: "uploads/" });
app.post("/api/sell", upload.single("photo"), (req, res) => {
  const { name, description, price, sellerId, student_id } = req.body;
  const product_id = `${sellerId}-${name}`;
  db.run("INSERT INTO products (seller_id, product_id, name, description, price, photo, student_id) VALUES (?,?,?,?,?,?,?)",
    [sellerId, product_id, name, description, price, req.file.path, student_id],
    (err) => err ? res.status(500).json(err) : res.json({ message: "Product Listed" })
  );
});

// Get Products
app.get("/api/products", (req, res) => {
  db.all("SELECT * FROM products WHERE is_sold = 0", [], (err, products) => {
    err ? res.status(500).json(err) : res.json(products);
  });
});

// Buy Product
app.post("/api/buy/:id", (req, res) => {
  db.run("UPDATE products SET is_sold = 1 WHERE id = ?", [req.params.id],
    (err) => err ? res.status(500).json(err) : res.json({ message: "Product Purchased" })
  );
});

// Fetch Institutions
app.get("/api/institutions", (req, res) => {
  db.all("SELECT * FROM institutions", [], (err, institutions) => {
    err ? res.status(500).json(err) : res.json(institutions);
  });
});

// Server Listening
app.listen(5000, () => console.log("Server running on port 5000"));
