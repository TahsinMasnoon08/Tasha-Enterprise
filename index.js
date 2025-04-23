const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const session = require("express-session");

const app = express();
const port = 3000;

// Middleware
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
    console.error("❌ DB connection failed:", err);
  } else {
    console.log("✅ Connected to MySQL (tasha_db)");
  }
});

// ROUTES
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

// ✅ Final combined login logic
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
      // ✅ Check in admin table if user not found
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

// ✅ Home route
app.get("/home", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  res.render("home", {
    user: req.session.user,
    role: req.session.role
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
