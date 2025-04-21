index.js
const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

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
    console.log("✅ Connected to MySQL");
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

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const sql = "SELECT * FROM users WHERE email = ?";
  db.query(sql, [email], (err, results) => {
    if (err) throw err;
    if (results.length === 0) return res.send("No user found.");
    const user = results[0];
    bcrypt.compare(password, user.password, (err, match) => {
      if (err) throw err;
      if (match) {
        // Instead of trying to use the template with variables, directly send HTML with user name embedded
        res.send(
<!DOCTYPE html>
<html>
<head>
  <title>Tasha Enterprise</title>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
  <style>
    .navbar-logo {
      height: 45px;
    }
    .user-dropdown:hover .dropdown-menu {
      display: block;
    }
  </style>
</head>
<body>

<!-- ✅ Navbar -->
<nav class="navbar navbar-expand-lg navbar-light bg-white shadow-sm position-fixed w-100 z-3">
  <div class="container d-flex align-items-center justify-content-between">
    
    <!-- Logo -->
    <a class="navbar-brand d-flex align-items-center me-3" href="/">
      <img src="/images/tashalogo.png" alt="Tasha Logo" height="150" width="200">
    </a>

    <!-- Search -->
    <form class="d-none d-lg-flex flex-grow-1 me-4" role="search">
      <input class="form-control rounded-pill px-3" type="search" placeholder="Search products..." aria-label="Search" style="min-width: 300px;" />
    </form>

    <!-- Nav links -->
    <ul class="navbar-nav gap-3 align-items-center">
      <li class="nav-item"><a class="nav-link" href="/">Home</a></li>
      <li class="nav-item"><a class="nav-link" href="#">Shop</a></li>
      <li class="nav-item"><a class="nav-link" href="#">About Us</a></li>
      <li class="nav-item"><a class="nav-link" href="#">Contact</a></li>

      <!-- 👋 Greeting -->
      <li class="nav-item">
        <span class="nav-link fw-bold">Hi, ${user.name}</span>
      </li>

      <!-- 👤 Dropdown -->
      <li class="nav-item dropdown user-dropdown">
        <a class="nav-link dropdown-toggle d-flex align-items-center" href="#" id="userDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
          <img src="/images/human.png" alt="User" width="20" height="20" class="ms-1">
        </a>
        <ul class="dropdown-menu dropdown-menu-end mt-2" aria-labelledby="userDropdown">
          <li><a class="dropdown-item" href="#">Account</a></li>
          <li><a class="dropdown-item" href="#">Personal Information</a></li>
          <li><a class="dropdown-item" href="#">Orders</a></li>
          <li><hr class="dropdown-divider" /></li>
          <li><a class="dropdown-item text-danger" href="/logout">Logout</a></li>
        </ul>
      </li>
    </ul>

  </div>
</nav>

<!-- Welcome section -->
<section class="text-center py-5 mt-5">
  <h1>Welcome to Tasha Enterprise</h1>
  <p>Explore premium fashion and lifestyle items</p>
</section>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
        );
      } else {
        res.send("Wrong password.");
      }
    });
  });
});

app.get("/home", (req, res) => {
  res.render("home"); // This route will show "Guest" since no user info is passed
});

app.get("/logout", (req, res) => {
  res.redirect("/login");
});

app.listen(port, () => {
  console.log(🚀 Server running on http://localhost:${port});
});
