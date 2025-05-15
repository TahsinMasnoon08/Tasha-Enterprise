const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const session = require("express-session");

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
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

db.connect(err => {
  if (err) {
    console.error("❌ DB connection failed:", err);
  } else {
    console.log("✅ Connected to MySQL (tasha_db)");
  }
});

// Routes

app.get("/", (req, res) => res.redirect("/login"));

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/signup", (req, res) => {
  res.render("signup");
});

// Login with bcrypt
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.query("SELECT * FROM admin WHERE email = ?", [email], (err, adminResults) => {
    if (err) throw err;

    if (adminResults.length > 0) {
      const admin = adminResults[0];

      bcrypt.compare(password, admin.password, (err, result) => {
        if (err) throw err;

        if (result) {
          req.session.user = admin;
          req.session.role = "admin"; // ✅ role set here
          return res.redirect("/home");
        }

        checkUser();
      });
    } else {
      checkUser();
    }

    function checkUser() {
      db.query("SELECT * FROM users WHERE email = ?", [email], (err, userResults) => {
        if (err) throw err;

        if (userResults.length > 0) {
          const user = userResults[0];

          bcrypt.compare(password, user.password, (err, result) => {
            if (err) throw err;

            if (result) {
              req.session.user = user;
              req.session.role = "user"; // ✅ role set here
              return res.redirect("/home");
            } else {
              res.send("Invalid email or password.");
            }
          });
        } else {
          res.send("Invalid email or password.");
        }
      });
    }
  });
});

// Home page with featured products
app.get("/home", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const role = req.session.role || "user";

  db.query("SELECT * FROM products WHERE featured = 1", (err, featuredResults) => {
    if (err) throw err;

    res.render("home", {
      user: req.session.user,
      role,
      featuredProducts: featuredResults
    });
  });
});

// ✅ Admin Dashboard (fixed)
app.get("/admin/dashboard", (req, res) => {
  const action = req.query.action || "";

  if (!req.session.user || req.session.role !== "admin") {
    return res.send("Unauthorized access.");
  }

  if (action === "view") {
    db.query("SELECT * FROM products", (err, results) => {
      if (err) throw err;
      res.render("admin-dashboard", { action, products: results });
    });
  } else {
    res.render("admin-dashboard", { action });
  }
});

// Add product
app.post("/admin/add-product", (req, res) => {
  const { name, target_group, category, price, image, description, featured } = req.body;

  const isFeatured = parseInt(featured) === 1 ? 1 : 0;

  const sql = `
    INSERT INTO products (name, target_group, category, price, image, description, featured)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(sql, [name, target_group, category, price, image, description, isFeatured], (err) => {
    if (err) throw err;
    res.redirect("/admin/dashboard?action=view");
  });
});



// Delete product
app.get("/admin/delete/:id", (req, res) => {
  const productId = req.params.id;
  db.query("DELETE FROM products WHERE id = ?", [productId], (err) => {
    if (err) throw err;
    res.redirect("/admin/dashboard?action=view");
  });
});

// Admin Edit
app.get("/admin/edit/:id", (req, res) => {
  const productId = req.params.id;
  const sql = "SELECT * FROM products WHERE id = ?";
  db.query(sql, [productId], (err, results) => {
    if (err) return res.send("Error loading product.");
    if (results.length === 0) return res.send("Product not found.");

    res.render("admin-edit-product", {
      product: results[0],
      user: req.session.user,
      role: req.session.role
    });
  });
});

app.post("/admin/edit/:id", (req, res) => {
  const productId = req.params.id;
  const { name, price, description, image, featured, target_group, category } = req.body;

  const sql = `
    UPDATE products
    SET name = ?, price = ?, description = ?, image = ?, featured = ?, target_group = ?, category = ?
    WHERE id = ?
  `;
  const values = [name, price, description, image, featured ? 1 : 0, target_group, category, productId];

  db.query(sql, values, (err) => {
    if (err) {
      console.error("Edit Product Error:", err);
      return res.send("❌ Failed to update product");
    }
    res.redirect("/admin/dashboard");
  });
});

// Category page (user side)
app.get("/category", (req, res) => {
  const group = req.query.group;
  const category = req.query.category;
  const sale = req.query.sale === 'true';

  let sql = "SELECT * FROM products WHERE target_group = ?";
  const params = [group];

  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }
  if (sale) {
    sql += " AND sale = 1";
  }

  db.query(sql, params, (err, results) => {
    if (err) return res.send("Error fetching category products");

    res.render("category", {
      products: results,
      user: req.session.user,
      role: req.session.role,
      title: group.charAt(0).toUpperCase() + group.slice(1)
    });
  });
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
