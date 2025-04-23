// index.js
const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const session = require("express-session");

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

app.use(session({
  secret: "tasha-secret-key",
  resave: false,
  saveUninitialized: true
}));

// MySQL connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "tasha_db"
});

db.connect((err) => {
  if (err) {
    console.error("\u274C DB connection failed:", err);
  } else {
    console.log("\u2705 Connected to MySQL (tasha_db)");
  }
});

// Routes
app.get("/", (req, res) => {
  res.redirect("/login");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/signup", (req, res) => {
  res.render("signup");
});

app.post("/signup", (req, res) => {
  const { name, email, password } = req.body;
  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) return res.send("Error hashing password");
    const sql = "INSERT INTO users (name, email, password) VALUES (?, ?, ?)";
    db.query(sql, [name, email, hashedPassword], (err) => {
      if (err) return res.send("Email already used or DB error.");
      res.send("Signup successful. <a href='/login'>Login now</a>");
    });
  });
});

// Unified login
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.query("SELECT * FROM users WHERE email = ?", [email], (err, userResults) => {
    if (err) return res.send("Database error (users)");

    if (userResults.length > 0) {
      const user = userResults[0];
      bcrypt.compare(password, user.password, (err, match) => {
        if (err) return res.send("Error comparing password (user)");
        if (match) {
          req.session.user = user;
          req.session.role = "user";
          return res.redirect("/home");
        } else {
          return res.send("Wrong password (user)");
        }
      });
    } else {
      db.query("SELECT * FROM admin WHERE email = ?", [email], (err, adminResults) => {
        if (err) return res.send("Database error (admin)");

        if (adminResults.length > 0) {
          const admin = adminResults[0];
          bcrypt.compare(password, admin.password, (err, match) => {
            if (err) return res.send("Error comparing password (admin)");
            if (match) {
              req.session.user = admin;
              req.session.role = "admin";
              return res.redirect("/home");
            } else {
              return res.send("Wrong password (admin)");
            }
          });
        } else {
          return res.send("No user or admin found with that email.");
        }
      });
    }
  });
});

// Home route for both user and admin
app.get("/home", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const sql = "SELECT * FROM products WHERE featured = 1";
  db.query(sql, (err, products) => {
    if (err) return res.send("Error fetching featured products");

    res.render("home", {
      user: req.session.user,
      role: req.session.role,
      featuredProducts: products
    });
  });
});

// Admin dashboard route (optional)
app.get("/admin/dashboard", (req, res) => {
  if (!req.session.user || req.session.role !== "admin") return res.redirect("/login");

  res.render("admin-dashboard", {
    user: req.session.user,
    role: req.session.role
  });
});

// Add Product POST
app.post("/admin/add-product", (req, res) => {
  const { name, price, description, image, featured } = req.body;
  const sql = "INSERT INTO products (name, price, description, image, featured) VALUES (?, ?, ?, ?, ?)";
  db.query(sql, [name, price, description, image, featured ? 1 : 0], (err) => {
    if (err) return res.send("\u274C Failed to add product");
    res.redirect("/admin/dashboard");
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

app.listen(port, () => {
  console.log(`\uD83D\uDE80 Server running on http://localhost:${port}`);
});
