const IMGBB_API_KEY = "434df85246c681a776092f3b1b8d95fc";
const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const REPLICATE_API_TOKEN = "r8_MVjBKpn46Y56MdBgLkHyhhr8WbS8ns63ITFzw";
const nodemailer = require("nodemailer");
const crypto = require("crypto");



const transporter = nodemailer.createTransport({
  service: "gmail", // or your preferred email service
  auth: {
    user: "masnoonsami08@gmail.com",
    pass: "wjcu vpnq rdwy onnd" // Use app password (NOT your Gmail password)
  }
});

async function tryOnImage(userImageUrl, clothingImageUrl) {
  console.log("Attempting garment transfer using lucataco model");
  console.log("User Image:", userImageUrl);
  console.log("Clothing Image:", clothingImageUrl);

  const response = await axios.post(
    "https://api.replicate.com/v1/predictions",
    {
      version:
        "4f587aa42867bb9fc5fd8e22449d58249c681195c1ff6dc27a4390a1720ee1d2",
      input: {
        image: userImageUrl,
        clothing: clothingImageUrl,
      },
    },
    {
      headers: {
        Authorization: `Token ${REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
}

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));
app.set("view engine", "ejs");

app.use(
  session({
    secret: "tasha-secret-key",
    resave: false,
    saveUninitialized: true,
  })
);

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "tasha_db",
});

db.connect((err) => {
  if (err) console.error("❌ DB connection failed:", err);
  else console.log("✅ Connected to MySQL (tasha_db)");
});

function getCartCount(userId, callback) {
  const sql = "SELECT SUM(quantity) AS count FROM cart WHERE user_id = ?";
  db.query(sql, [userId], (err, result) => {
    if (err) return callback(0);
    callback(result[0].count || 0);
  });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "public", "uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

app.get("/", (req, res) => res.redirect("/login"));
app.get("/login", (req, res) => res.render("login"));
app.get("/signup", (req, res) => res.render("signup"));


app.post("/signup", (req, res) => {
  const { name, email, password } = req.body;

  // ✅ Validate email domain
  const allowedDomains = ["gmail.com", "yahoo.com", "hotmail.com"];
  const emailParts = email.split("@");
  const domain = emailParts[1];

  if (!domain || !allowedDomains.includes(domain.toLowerCase())) {
    return res.send("Only Gmail, Yahoo, or Hotmail addresses are allowed.");
  }

  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) return res.status(500).send("Server error.");

    const sql = "INSERT INTO users (name, email, password) VALUES (?, ?, ?)";
    db.query(sql, [name, email, hashedPassword], (err) => {
      if (err) return res.status(500).send("Failed to register.");
      res.redirect("/login");
    });
  });
});


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
          req.session.role = "admin";
          return res.redirect("/home");
        }
        checkUser(); // If admin password mismatch, check user
      });
    } else {
      checkUser(); // If no admin found, check user
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
              req.session.role = "user";
              return res.redirect("/home");
            } else {
              return res.redirect("/login?error=invalid");
            }
          });
        } else {
          return res.redirect("/login?error=invalid");
        }
      });
    }
  });
});


app.get("/home", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const role = req.session.role || "user";
  const userId = req.session.user.id;

  const sql = `
    SELECT p.*, 
      (SELECT image_url FROM product_images WHERE product_id = p.id LIMIT 1) AS image_url 
    FROM products p 
    WHERE p.featured = 1
  `;

  db.query(sql, (err, featuredResults) => {
    if (err) throw err;
    getCartCount(userId, (cartCount) => {
      res.render("home", {
        user: req.session.user,
        role,
        featuredProducts: featuredResults,
        cartCount,
      });
    });
  });
});

// ✅ Add product
app.post("/admin/add-product", upload.array("images", 5), (req, res) => {
  let { name, target_group, category, price, description, featured, sale_price, new_in } = req.body;
  if (new_in === '1') category = 'New In';

  const isFeatured = parseInt(featured) === 1 ? 1 : 0;
  const sizes = Array.isArray(req.body.sizes) ? req.body.sizes.join(",") : req.body.sizes;
  const imageFilenames = req.files.map(file => "/uploads/" + file.filename);

  const sql = `
    INSERT INTO products (name, target_group, category, price, description, featured, sizes, sale_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  db.query(sql, [name, target_group, category, price, description, isFeatured, sizes, sale_price || null], (err, result) => {
    if (err) return res.status(500).send("Error saving product");

    const productId = result.insertId;
    const imageSql = `INSERT INTO product_images (product_id, image_url) VALUES ?`;
    const values = imageFilenames.map(url => [productId, url]);
    db.query(imageSql, [values], (err2) => {
      if (err2) return res.status(500).send("Images failed");

      const stockValues = [];
      if (Array.isArray(req.body.sizes)) {
        req.body.sizes.forEach(size => {
          const stockKey = `stock_${size}`;
          const stockQty = parseInt(req.body[stockKey]) || 0;
          stockValues.push([productId, size.trim(), stockQty]);
        });
      } else {
        stockValues.push([productId, req.body.sizes.trim(), parseInt(req.body["stock_OneSize"]) || 0]);
      }

      db.query("INSERT INTO product_stock (product_id, size, stock) VALUES ?", [stockValues], err3 => {
        if (err3) return res.status(500).send("❌ Failed to save stock");
        res.redirect("/admin/dashboard?action=view");
      });
    });
  });
});

// ✅ Delete product
app.get("/admin/delete/:id", (req, res) => {
  const productId = req.params.id;

  const checkSql = "SELECT * FROM order_items WHERE product_id = ?";
  db.query(checkSql, [productId], (err, results) => {
    if (err) return res.redirect("/admin/dashboard?action=view&error=db");

    if (results.length > 0) {
      return res.redirect("/admin/dashboard?action=view&error=ordered");
    }

    db.query("DELETE FROM products WHERE id = ?", [productId], (err) => {
      if (err) return res.redirect("/admin/dashboard?action=view&error=deletefail");
      res.redirect("/admin/dashboard?action=view&success=deleted");
    });
  });
});

//ForgetPass

// ✅ Route: Show the forgot password form (GET)
app.get("/forgot", (req, res) => {
  res.render("forgot"); // Make sure you have views/forgot.ejs
});

// ✅ Route: Handle form submission, generate OTP and send email (POST)
app.post("/forgot", (req, res) => {
  const email = req.body.email;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 mins

  const insertSQL = "INSERT INTO password_reset_tokens (email, otp, expires_at) VALUES (?, ?, ?)";
  db.query(insertSQL, [email, otp, expiresAt], err => {
    if (err) return res.send("❌ Error generating OTP");

    // Send the OTP via Gmail
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "masnoonsami08@gmail.com",
    pass: "wjcu vpnq rdwy onnd"
      }
    });

    const mailOptions = {
      from: "Tasha Enterprise <YOUR_GMAIL@gmail.com>",
      to: email,
      subject: "🔐 Tasha Enterprise - Password Reset OTP",
      html: `<p>Your OTP is: <strong>${otp}</strong></p><p>This will expire in 10 minutes.</p>`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) return res.send("❌ Failed to send OTP. Please try again.");
      res.render("reset-password", { email, otpError: "" });

    });
  });
});

// ✅ Route: Show reset-password page via GET (when OTP fails)
app.get("/reset-password", (req, res) => {
  const email = req.query.email || "";
  const otpError = req.query.otpError || "";
  res.render("reset-password", { email, otpError });
});


// ✅ Route: Handle OTP and reset password
app.post("/reset-password", (req, res) => {
  const { email, otp, newPassword } = req.body;

  const checkSQL = "SELECT * FROM password_reset_tokens WHERE email = ? AND otp = ? AND expires_at > NOW()";
  db.query(checkSQL, [email, otp], (err, results) => {
    if (err || results.length === 0) {
       return res.redirect(`/reset-password?email=${encodeURIComponent(email)}&otpError=1`);

    }

    const bcrypt = require("bcrypt");
    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    const updateSQL = "UPDATE users SET password = ? WHERE email = ?";
    db.query(updateSQL, [hashedPassword, email], err2 => {
      if (err2) return res.send("❌ Failed to update password.");

      // Delete used OTP
      db.query("DELETE FROM password_reset_tokens WHERE email = ?", [email]);
      res.render("reset-password", { email, otpError: "", success: "1" });

    });
  });
});




// ✅ Edit product - GET
app.get("/admin/edit/:id", (req, res) => {
  const productId = req.params.id;

  const productQuery = "SELECT * FROM products WHERE id = ?";
  const imagesQuery = "SELECT * FROM product_images WHERE product_id = ?";
  const stockQuery = "SELECT * FROM product_stock WHERE product_id = ?";

  db.query(productQuery, [productId], (err, productResults) => {
    if (err || productResults.length === 0) return res.send("❌ Product not found");
    const product = productResults[0];

    db.query(imagesQuery, [productId], (err2, imageResults) => {
      if (err2) return res.send("❌ Error loading images");

      db.query(stockQuery, [productId], (err3, stockResults) => {
        if (err3) return res.send("❌ Error loading stock");

        res.render("admin-edit-product", {
          product,
          productImages: imageResults,     // ✅ Must use "productImages" for EJS
          productStock: stockResults
        });
      });
    });
  });
});




// ✅ Edit product - POST
app.post("/admin/edit/:id", upload.array("images", 5), (req, res) => {
  const productId = req.params.id;
  const {
    name,
    price,
    description,
    featured,
    target_group,
    category,
    sizes,
    sale_price
  } = req.body;

  const updateProductSql = `
    UPDATE products 
    SET name = ?, price = ?, description = ?, featured = ?, 
        target_group = ?, category = ?, sizes = ?, sale_price = ?
    WHERE id = ?
  `;

const productValues = [
  name,
  price,
  description,
  featured === "on" ? 1 : 0,
  target_group,
  category,
  Array.isArray(sizes) ? sizes.join(",") : sizes, // ✅ join here
  sale_price || null,
  productId
];


  db.query(updateProductSql, productValues, (err) => {
    if (err) {
    console.error("❌ SQL Update Error:", err); // 🔍 this shows the real reason
    return res.status(500).send("❌ Failed to update product");
    }

    const fetchStockSql = "SELECT * FROM product_stock WHERE product_id = ?";
    db.query(fetchStockSql, [productId], (err2, stockRows) => {
      if (err2) return res.status(500).send("❌ Failed to fetch stock");

      const updateTasks = [];

      stockRows.forEach(stockItem => {
        const fieldName = `stock_${stockItem.size}`;
        const newStock = parseInt(req.body[fieldName], 10);
        if (!isNaN(newStock)) {
          const updateStockSql = "UPDATE product_stock SET stock = ? WHERE id = ?";
          updateTasks.push(new Promise((resolve, reject) => {
            db.query(updateStockSql, [newStock, stockItem.id], (err3) => {
              if (err3) reject(err3);
              else resolve();
            });
          }));
        }
      });

      // ✅ Handle deleted images
      const deleteImages = Array.isArray(req.body.delete_images) ? req.body.delete_images : [];
      deleteImages.forEach(url => {
        const deleteSql = "DELETE FROM product_images WHERE product_id = ? AND image_url = ?";
        updateTasks.push(new Promise((resolve, reject) => {
          db.query(deleteSql, [productId, url], (err) => {
            if (err) reject(err);
            else resolve();
          });
        }));
      });

      // ✅ Handle new uploaded images
      if (req.files && req.files.length > 0) {
        const imageSql = `INSERT INTO product_images (product_id, image_url) VALUES ?`;
        const imageValues = req.files.map(file => [productId, "/uploads/" + file.filename]);
        updateTasks.push(new Promise((resolve, reject) => {
          db.query(imageSql, [imageValues], (err) => {
            if (err) reject(err);
            else resolve();
          });
        }));
      }

      // ✅ Finalize all updates and redirect
      Promise.all(updateTasks)
        .then(() => res.redirect("/admin/dashboard?action=view&success=updated"))
        .catch((e) => {
          console.error("❌ Error in update pipeline:", e);
          res.status(500).send("❌ Failed to update product fully.");
        });
    });
  });
});


// ✅ Category page
app.get("/category", (req, res) => {
  const group = req.query.group;
  const category = req.query.category;
  const sale = req.query.sale === 'true';

  let sql = `
    SELECT p.*, 
      (SELECT image_url FROM product_images WHERE product_id = p.id LIMIT 1) AS image_url 
    FROM products p 
    WHERE target_group = ?
  `;
  const params = [group];

  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }
  if (sale) {
    sql += " AND sale_price IS NOT NULL AND sale_price > 0";
  }

  db.query(sql, params, (err, results) => {
    if (err) return res.send("Error fetching category products");
    getCartCount(req.session.user.id, (cartCount) => {
      res.render("category", {
        products: results,
        user: req.session.user,
        role: req.session.role,
        title: group.charAt(0).toUpperCase() + group.slice(1),
        cartCount,
      });
    });
  });
});


// ✅ Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// ✅ Cart system
app.post("/add-to-cart", (req, res) => {
  if (!req.session.user || req.session.role !== "user") {
    return res.status(401).send("Unauthorized.");
  }

  const userId = req.session.user.id;
  const { product_id, size, quantity } = req.body;
  const qtyToAdd = parseInt(quantity) || 1;

  const sql = `
    SELECT ps.stock, IFNULL(c.quantity, 0) AS cartQty
    FROM product_stock ps
    LEFT JOIN cart c 
      ON c.product_id = ps.product_id 
      AND c.size = ps.size 
      AND c.user_id = ?
    WHERE ps.product_id = ? AND ps.size = ?
  `;

  db.query(sql, [userId, product_id, size], (err, results) => {
    if (err || results.length === 0) {
      return res.status(500).send("Stock check failed");
    }

    const { stock, cartQty } = results[0];
    const newTotal = cartQty + qtyToAdd;

    if (newTotal > stock) {
      return res.redirect(`/product/${product_id}?error=stocklimit`);
    }

    if (cartQty > 0) {
      db.query(
        "UPDATE cart SET quantity = quantity + ? WHERE user_id = ? AND product_id = ? AND size = ?",
        [qtyToAdd, userId, product_id, size],
        (err) => {
          if (err) return res.status(500).send("Failed to update cart");
          res.redirect(req.get("Referer") || "/home");
        }
      );
    } else {
      db.query(
        "INSERT INTO cart (user_id, product_id, quantity, size) VALUES (?, ?, ?, ?)",
        [userId, product_id, qtyToAdd, size],
        (err) => {
          if (err) return res.status(500).send("Failed to add to cart");
          res.redirect(req.get("Referer") || "/home");
        }
      );
    }
  });
});

app.get("/cart", (req, res) => {
  if (!req.session.user || req.session.role !== "user") return res.redirect("/login");
  const userId = req.session.user.id;

  const sql = `
    SELECT 
      cart.id,
      products.name,
      products.price,
      cart.size,
      cart.quantity,
      (
        SELECT image_url 
        FROM product_images 
        WHERE product_id = products.id 
        LIMIT 1
      ) AS image_url
    FROM cart
    JOIN products ON cart.product_id = products.id
    WHERE cart.user_id = ?
  `;

  db.query(sql, [userId], (err, results) => {
    if (err) return res.status(500).send("Error loading cart");
    let total = 0;
    results.forEach((item) => (total += item.price * item.quantity));
    res.render("cart", {
      cartItems: results,
      total,
      user: req.session.user,
      role: req.session.role,
      cartCount: results.length,
    });
  });
});



app.get("/cart/increase/:id", (req, res) => {
  const cartId = req.params.id;

  db.query("SELECT product_id, size, quantity FROM cart WHERE id = ?", [cartId], (err1, cartResult) => {
    if (err1 || cartResult.length === 0) return res.redirect("/cart?error=db");

    const { product_id, size, quantity } = cartResult[0];
    const cleanSize = size.trim();

    const stockSql = "SELECT stock FROM product_stock WHERE product_id = ? AND size = ?";
    db.query(stockSql, [product_id, cleanSize], (err2, stockResult) => {
      if (err2 || stockResult.length === 0) return res.redirect("/cart?error=nostock");

      const stock = stockResult[0].stock;
      if (quantity >= stock) {
        return res.redirect("/cart?error=stocklimit");
      }

      db.query("UPDATE cart SET quantity = quantity + 1 WHERE id = ?", [cartId], (err3) => {
        if (err3) return res.redirect("/cart?error=updatefail");
        res.redirect("/cart");
      });
    });
  });
});

app.get("/cart/decrease/:id", (req, res) => {
  db.query("SELECT quantity FROM cart WHERE id = ?", [req.params.id], (err, results) => {
    if (err || results.length === 0) return res.status(500).send("Error");
    if (results[0].quantity <= 1) {
      db.query("DELETE FROM cart WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).send("Error deleting");
        res.redirect("/cart");
      });
    } else {
      db.query("UPDATE cart SET quantity = quantity - 1 WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).send("Error decreasing");
        res.redirect("/cart");
      });
    }
  });
});

app.get("/cart/remove/:id", (req, res) => {
  db.query("DELETE FROM cart WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).send("Error removing");
    res.redirect("/cart");
  });
});

// ✅ Checkout - GET
app.get("/checkout", (req, res) => {
  if (!req.session.user || req.session.role !== "user") return res.redirect("/login");

  const userId = req.session.user.id;

  const cartSql = `
    SELECT 
      cart.id,
      products.name,
      products.price,
      cart.size,
      cart.quantity,
      (
        SELECT image_url 
        FROM product_images 
        WHERE product_id = products.id 
        LIMIT 1
      ) AS image_url,
      (
        SELECT stock 
        FROM product_stock 
        WHERE product_id = cart.product_id AND size = cart.size
      ) AS stock
    FROM cart
    JOIN products ON cart.product_id = products.id
    WHERE cart.user_id = ?
  `;

  const userSql = "SELECT name, phone FROM users WHERE id = ?";
  const defaultAddressSql = "SELECT * FROM user_addresses WHERE user_id = ? AND is_default = 1 LIMIT 1";
  const allAddressesSql = "SELECT * FROM user_addresses WHERE user_id = ?";

  db.query(userSql, [userId], (err0, userResult) => {
    if (err0) return res.status(500).send("❌ Failed to fetch user");

    db.query(defaultAddressSql, [userId], (err1, defaultAddressResult) => {
      if (err1) return res.status(500).send("❌ Failed to fetch default address");

      db.query(allAddressesSql, [userId], (err2, allAddresses) => {
        if (err2) return res.status(500).send("❌ Failed to fetch addresses");

        db.query(cartSql, [userId], (err3, cartItems) => {
          if (err3 || cartItems.length === 0) {
            return res.status(500).send("❌ Cannot checkout: Cart is empty or DB error.");
          }

          let total = 0;
          cartItems.forEach(item => {
            total += item.quantity * item.price;
          });

          getCartCount(userId, (cartCount) => {
            res.render("checkout", {
              cartItems,
              total,
              user: req.session.user,
              role: req.session.role,
              cartCount,
              deliveryInfo: defaultAddressResult[0] || {},
              allAddresses: allAddresses || [],
              userInfo: userResult[0] || {}
            });
          });
        });
      });
    });
  });
});


// ✅ Checkout - POST
app.post("/checkout", (req, res) => {
  if (!req.session.user || req.session.role !== "user") return res.redirect("/login");

  const { name, address, postcode, phone, payment } = req.body;
  const userId = req.session.user.id;

  const sql = `
    SELECT cart.product_id, cart.quantity, cart.size, products.price, products.name
    FROM cart
    JOIN products ON cart.product_id = products.id
    WHERE cart.user_id = ?
  `;

  db.query(sql, [userId], (err, cartItems) => {
    if (err || cartItems.length === 0) return res.send("❌ Cannot place order");

    let total = 0;
    cartItems.forEach(item => {
      total += item.price * item.quantity;
    });

    const orderNumber = "M" + Math.floor(10000 + Math.random() * 90000);

    const orderSql = `
      INSERT INTO orders (user_id, total, name, address, postcode, phone, payment_method, order_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(orderSql, [userId, total, name, address, postcode, phone, payment, orderNumber], (err, result) => {
      if (err) return res.status(500).send("❌ Failed to place order");

      const orderId = result.insertId;
      const orderItems = cartItems.map(item => [orderId, item.product_id, item.quantity, item.price]);

      db.query("INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ?", [orderItems], (err) => {
        if (err) return res.status(500).send("❌ Failed to save items");

        const updatePromises = cartItems.map(item => {
          return new Promise((resolve, reject) => {
            const updateSql = `
              UPDATE product_stock
              SET stock = stock - ?
              WHERE product_id = ? AND size = ?
            `;
            db.query(updateSql, [item.quantity, item.product_id, item.size], (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        });

        Promise.all(updatePromises)
          .then(() => {
            db.query("DELETE FROM cart WHERE user_id = ?", [userId], (err) => {
              if (err) return res.status(500).send("❌ Failed to clear cart");

              // ✅ Send Email
              const emailHtml = `
                <h2>✅ Order Placed Successfully!</h2>
                <p><strong>Order No:</strong> ${orderNumber}</p>
                <p><strong>Shipping Address:</strong><br>${address}, ${postcode}</p>
                <p><strong>Phone:</strong> ${phone}</p>
                <p><strong>Payment:</strong> ${payment}</p>
                <p><strong>Total:</strong> $${total}</p>
                <hr>
                <h4>🛍 Items Ordered:</h4>
                <ul>
                  ${cartItems.map(item => `<li>${item.name} (Size: ${item.size}) — Qty: ${item.quantity} — $${item.price}</li>`).join("")}
                </ul>
                <br>
                <p>Thank you for shopping with Tasha Enterprise!</p>
              `;

              transporter.sendMail({
                from: "Tasha Enterprise <yourgmail@gmail.com>",
                to: req.session.user.email,
                subject: `🧾 Order Confirmation - ${orderNumber}`,
                html: emailHtml
              }, (err, info) => {
                if (err) console.error("❌ Email error:", err);
                else console.log("✅ Email sent:", info.response);
                return res.redirect(`/order?success=true&orderNumber=${orderNumber}`);
              });
            });
          })
          .catch(() => {
            res.status(500).send("❌ Failed to update stock");
          });
      });
    });
  });
});


// ✅ Product detail page
app.get("/product/:id", (req, res) => {
  const productId = req.params.id;
  const userId = req.session.user?.id || 0;

  db.query("SELECT * FROM products WHERE id = ?", [productId], (err, productResult) => {
    if (err || productResult.length === 0) return res.send("Product not found");
    const product = productResult[0];

    db.query("SELECT image_url FROM product_images WHERE product_id = ?", [productId], (err2, imageResults) => {
      const images = imageResults.map(img => img.image_url);

      db.query(
        "SELECT * FROM products WHERE id != ? AND target_group = ? ORDER BY RAND() LIMIT 3",
        [productId, product.target_group],
        (err3, recommended) => {

          const stockSql = `
            SELECT 
              ps.size, 
              ps.stock - IFNULL(c.quantity, 0) AS remaining_stock 
            FROM product_stock ps
            LEFT JOIN cart c 
              ON ps.product_id = c.product_id 
              AND ps.size = c.size 
              AND c.user_id = ?
            WHERE ps.product_id = ?
          `;

          db.query(stockSql, [userId, productId], (err4, stockResults) => {
            if (err4) return res.send("Error loading stock");

            const stockMap = {};
            stockResults.forEach(s => {
              stockMap[s.size.trim()] = Math.max(s.remaining_stock, 0);
            });

            getCartCount(userId, (cartCount) => {
              // ✅ Fetch related products here
              db.query(
                `SELECT p.id, p.name, p.price, p.sale_price, pi.image_url
                 FROM products p
                 JOIN product_images pi ON p.id = pi.product_id
                 WHERE p.category = ? AND p.id != ?
                 GROUP BY p.id
                 LIMIT 3`,
                [product.category, productId],
                (err5, relatedProducts) => {
                  if (err5) return res.send("Error loading related products");

                  res.render("product-detail", {
                    product,
                    images,
                    recommended,
                    user: req.session.user,
                    role: req.session.role,
                    cartCount,
                    stockMap,
                    relatedProducts // ✅ added to be used in EJS
                  });
                }
              );
            });
          });
        }
      );
    });
  });
});


// ✅ Show personal info form
app.get("/account/personal-info", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const userId = req.session.user.id;

  const infoSql = "SELECT name, email, phone FROM users WHERE id = ?";
  const addressSql = "SELECT * FROM user_addresses WHERE user_id = ?";

  db.query(infoSql, [userId], (err1, infoResult) => {
    if (err1) return res.send("Error loading user info");

    db.query(addressSql, [userId], (err2, addressResults) => {
      if (err2) return res.send("Error loading addresses");

      getCartCount(userId, (cartCount) => {
        res.render("personal-info", {
          user: req.session.user,
          role: req.session.role,
          cartCount,
          info: infoResult[0],
          addresses: addressResults,
          success: req.query.success,
          error: req.query.error
        });
      });
    });
  });
});


// ✅ Handle personal info form submission
app.post("/account/personal-info", (req, res) => {
  const { name, email, phone, address, postcode } = req.body;
  const userId = req.session.user.id;

  const sql = "UPDATE users SET name = ?, email = ?, phone = ?, address = ?, postcode = ? WHERE id = ?";
  db.query(sql, [name, email, phone, address, postcode, userId], (err) => {
    if (err) {
      return res.redirect("/account/personal-info?error=true");
    }
    req.session.user.name = name;
    res.redirect("/account/personal-info?success=true");
  });
});

// ✅ Order history
app.get("/account/order", (req, res) => {
  if (!req.session.user || req.session.role !== "user") return res.redirect("/login");

  const userId = req.session.user.id;

  const orderSql = `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`;
  const itemsSql = `
    SELECT 
      order_items.order_id,
      order_items.product_id,
      order_items.quantity,
      order_items.price,
      products.name,
      (
        SELECT image_url FROM product_images 
        WHERE product_images.product_id = products.id 
        LIMIT 1
      ) AS image_url
    FROM order_items
    JOIN products ON order_items.product_id = products.id
    WHERE order_items.order_id IN (
      SELECT id FROM orders WHERE user_id = ?
    )
  `;

  db.query(orderSql, [userId], (err1, orderResults) => {
    if (err1) return res.send("Failed to load orders");

    db.query(itemsSql, [userId], (err2, itemResults) => {
      if (err2) return res.send("Failed to load order items");

      const orderItemsMap = {};
      itemResults.forEach(item => {
        if (!orderItemsMap[item.order_id]) {
          orderItemsMap[item.order_id] = [];
        }
        orderItemsMap[item.order_id].push(item);
      });

      getCartCount(userId, (cartCount) => {
        res.render("order", {
          orders: orderResults,
          itemsMap: orderItemsMap,
          user: req.session.user,
          role: req.session.role,
          cartCount,
          orderNumber: null // ✅ Fix: Add this line to avoid EJS crash
        });
      });
    });
  });
});


// ✅ Admin Dashboard
app.get("/admin/dashboard", (req, res) => {
  const action = req.query.action || "";
  if (!req.session.user || req.session.role !== "admin") {
    return res.send("Unauthorized access.");
  }

  if (action === "view") {
    const searchQuery = req.query.q;
    let sql = `
      SELECT p.*, 
             COALESCE(MIN(pi.image_url), '') AS image
      FROM products p
      LEFT JOIN product_images pi ON p.id = pi.product_id
    `;
    const params = [];

    if (searchQuery) {
      sql += ` WHERE p.name LIKE ? OR p.category LIKE ? OR p.target_group LIKE ? `;
      const likeQuery = `%${searchQuery}%`;
      params.push(likeQuery, likeQuery, likeQuery);
    }

    sql += ` GROUP BY p.id ORDER BY p.id DESC `;

    db.query(sql, params, (err, results) => {
      if (err) {
        console.error("❌ Admin dashboard view error:", err);
        return res.send("❌ Failed to load product list");
      }
      res.render("admin-dashboard", {
        action,
        products: results,
        orders: [],
        itemsMap: {},
        query: searchQuery || "",
        role: req.session.role
      });
    });

  } else if (action === "orders") {
    const search = req.query.order_search || "";
    const sort = req.query.sort || "newest";

    let ordersSql = `
      SELECT o.*, u.name AS customer_name, u.email, u.phone 
      FROM orders o
      JOIN users u ON o.user_id = u.id
    `;
    const orderParams = [];

    if (search) {
      ordersSql += " WHERE o.order_number LIKE ? ";
      orderParams.push(`%${search}%`);
    }

    if (sort === "newest") {
      ordersSql += " ORDER BY o.created_at DESC";
    } else if (sort === "oldest") {
      ordersSql += " ORDER BY o.created_at ASC";
    } else {
      ordersSql += search ? " AND" : " WHERE";
      ordersSql += " o.status = ?";
      orderParams.push(sort);
    }

    const itemsSql = `
      SELECT oi.*, p.name AS product_name,
        (SELECT image_url FROM product_images WHERE product_id = p.id LIMIT 1) AS image_url
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
    `;

    db.query(ordersSql, orderParams, (err1, orders) => {
      if (err1) return res.send("❌ Error loading orders");

      db.query(itemsSql, (err2, items) => {
        if (err2) return res.send("❌ Error loading order items");

        const itemsMap = {};
        items.forEach(item => {
          if (!itemsMap[item.order_id]) itemsMap[item.order_id] = [];
          itemsMap[item.order_id].push(item);
        });

        res.render("admin-dashboard", {
          action,
          orders,
          itemsMap,
          products: [],
          query: search,
          sort,
          role: req.session.role
        });
      });
    });

  } else {
    res.render("admin-dashboard", {
      action,
      products: [],
      orders: [],
      itemsMap: {},
      query: "",
      role: req.session.role
    });
  }
});



app.post("/admin/update-order-status", (req, res) => {
  const { order_id, status } = req.body;
  const sql = "UPDATE orders SET status = ? WHERE id = ?";
  db.query(sql, [status, order_id], err => {
    if (err) return res.status(500).send("Failed to update status");
    res.redirect("/admin/dashboard?action=orders");
  });
});

// 🛍️ Shop All Products
app.get("/shop", (req, res) => {
  const category = req.query.category || "all";
  const sort = req.query.sort || "newest";
  const page = parseInt(req.query.page) || 1;
  const itemsPerPage = 20;
  const offset = (page - 1) * itemsPerPage;
  const search = req.query.search ? req.query.search.trim() : "";
const min = req.query.min ? parseFloat(req.query.min) : null;
const max = req.query.max ? parseFloat(req.query.max) : null;



  let baseQuery = `
    SELECT products.*, 
           COALESCE(MIN(product_images.image_url), '') AS image_url 
    FROM products 
    LEFT JOIN product_images ON products.id = product_images.product_id
  `;

  let whereConditions = [];
  let whereValues = [];

  if (search) {
    whereConditions.push(`(
      products.name LIKE ? 
      OR products.description LIKE ? 
      OR products.category LIKE ?
    )`);
    whereValues.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (category && category !== "all") {
    if (category === "sale") {
      whereConditions.push("sale_price IS NOT NULL");
    } else if (category === "new") {
      whereConditions.push("category = 'New In'");
    } else {
      whereConditions.push("category = ?");
      whereValues.push(category);
    }
  }

  // ✅ Add price range filtering
 if (min !== null && max !== null) {
  whereConditions.push("(COALESCE(sale_price, price) BETWEEN ? AND ?)");
  whereValues.push(min, max);
} else if (min !== null) {
  whereConditions.push("COALESCE(sale_price, price) >= ?");
  whereValues.push(min);
} else if (max !== null) {
  whereConditions.push("COALESCE(sale_price, price) <= ?");
  whereValues.push(max);
}


  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  let orderClause = '';
  switch (sort) {
    case "price_low_high":
      orderClause = "ORDER BY COALESCE(sale_price, price) ASC";
      break;
    case "price_high_low":
      orderClause = "ORDER BY COALESCE(sale_price, price) DESC";
      break;
    case "oldest":
      orderClause = "ORDER BY products.id ASC";
      break;
    default:
      orderClause = "ORDER BY products.id DESC";
  }

  const finalQuery = `
    ${baseQuery}
    ${whereClause}
    GROUP BY products.id
    ${orderClause}
    LIMIT ? OFFSET ?
  `;

  const countQuery = `
    SELECT COUNT(DISTINCT products.id) AS total 
    FROM products 
    ${whereClause}
  `;

  const queryParams = [...whereValues, itemsPerPage, offset];
  const countParams = [...whereValues];

  db.query(finalQuery, queryParams, (err, products) => {
    if (err) return res.status(500).send("Database error");

    db.query(countQuery, countParams, (err2, countResults) => {
      if (err2) return res.status(500).send("Count error");

      const totalProducts = countResults[0].total;
      const totalPages = Math.ceil(totalProducts / itemsPerPage);

      const userId = req.session.user?.id || 0;
getCartCount(userId, (cartCount) => {
  res.render("shop", {
    products,
    currentPage: page,
    totalPages,
    selectedCategory: category,
    selectedSort: sort,
    searchQuery: search,
    min,
    max,
    user: req.session.user,
    role: req.session.role,
    cartCount
  });
});

    });
  });
});

// ✅ Search Suggestions
app.get("/search-suggestions", (req, res) => {
  const query = req.query.q || "";
  const sql = `
    SELECT name 
    FROM products 
    WHERE name LIKE ? OR category LIKE ?
    GROUP BY name 
    LIMIT 10
  `;
  db.query(sql, [`%${query}%`, `%${query}%`], (err, results) => {
    if (err) return res.status(500).json([]);
    const names = results.map(row => row.name);
    res.json(names);
  });
});

// ✅ Upload Image to ImgBB
app.post("/upload-image", upload.single("userImage"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    const imageBuffer = fs.readFileSync(req.file.path);
    const base64Image = imageBuffer.toString("base64");

    const params = new URLSearchParams();
    params.append("image", base64Image);

    const response = await axios.post(
      `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
      params,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    if (response.data.success) {
      console.log("✅ Uploaded image URL to use:", response.data.data.url);
      fs.unlinkSync(req.file.path);
      return res.json({
        success: true,
        imageUrl: response.data.data.url
      });
    } else {
      throw new Error("ImgBB upload failed");
    }
  } catch (error) {
    console.error("❌ Image upload error:", error.response?.data || error.message);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || "Failed to upload image"
    });
  }
});

//Converting image to url for garments
async function uploadToImgBB(localPath) {
  try {
    const imageBuffer = fs.readFileSync(localPath);
    const base64Image = imageBuffer.toString("base64");

    const params = new URLSearchParams();
    params.append("image", base64Image);

    const response = await axios.post(
      `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
      params,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    if (response.data.success) {
      return response.data.data.url;
    } else {
      throw new Error("ImgBB upload failed");
    }
  } catch (err) {
    console.error("❌ Failed to upload to ImgBB:", err.message);
    throw err;
  }
}


// ✅ Virtual Try-On



//AddNewAddress
app.post("/account/add-address", (req, res) => {
  const { address, postcode } = req.body;
  const userId = req.session.user.id;

  const sql = `INSERT INTO user_addresses (user_id, address, postcode, is_default)
               VALUES (?, ?, ?, 0)`;

  db.query(sql, [userId, address, postcode], (err) => {
    if (err) return res.redirect("/account/personal-info?error=true");
    res.redirect("/account/personal-info?success=true");
  });
});

//SetDefaultaddress
app.post("/account/set-default-address", (req, res) => {
  const addressId = req.body.address_id;
  const userId = req.session.user.id;

  const unsetSql = "UPDATE user_addresses SET is_default = 0 WHERE user_id = ?";
  const setSql = "UPDATE user_addresses SET is_default = 1 WHERE id = ? AND user_id = ?";

  db.query(unsetSql, [userId], (err1) => {
    if (err1) return res.redirect("/account/personal-info?error=true");

    db.query(setSql, [addressId, userId], (err2) => {
      if (err2) return res.redirect("/account/personal-info?error=true");
      res.redirect("/account/personal-info?success=true");
    });
  });
});

//Delete address
app.get("/account/delete-address/:id", (req, res) => {
  const addressId = req.params.id;
  const userId = req.session.user.id;

  const sql = "DELETE FROM user_addresses WHERE id = ? AND user_id = ?";
  db.query(sql, [addressId, userId], (err) => {
    if (err) return res.redirect("/account/personal-info?error=true");
    res.redirect("/account/personal-info?success=true");
  });
});

//Order Get
app.get("/order", (req, res) => {
  if (!req.session.user || req.session.role !== "user") return res.redirect("/login");

  const userId = req.session.user.id;
  const orderNumber = req.query.orderNumber || null;
  if (!orderNumber) return res.redirect("/home");

  const orderSql = `
    SELECT o.*, u.name AS customer_name, u.phone, ua.address, ua.postcode
    FROM orders o
    JOIN users u ON o.user_id = u.id
    LEFT JOIN user_addresses ua ON u.id = ua.user_id AND ua.is_default = 1
    WHERE o.user_id = ? AND o.order_number = ?
  `;

  const itemsSql = `
    SELECT oi.*, p.name AS product_name, pi.image_url, c.size
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    LEFT JOIN product_images pi ON pi.product_id = p.id
    LEFT JOIN cart c ON c.product_id = p.id
    WHERE oi.order_id = ?
    GROUP BY oi.id
  `;

  db.query(orderSql, [userId, orderNumber], (err1, orderResult) => {
    if (err1 || orderResult.length === 0) return res.status(404).send("❌ Order not found");

    const order = orderResult[0];
    db.query(itemsSql, [order.id], (err2, items) => {
      if (err2) return res.status(500).send("❌ Failed to fetch items");

      getCartCount(userId, (cartCount) => {
        res.render("order-success", {
          user: req.session.user,
          role: req.session.role,
          cartCount,
          order,
          items
        });
      });
    });
  });
});


//Checkout Session
const stripeBackend = require("stripe")("sk_test_51RXzCaICy91dN23racpcN8mS66xhxpFdDTWjCm41nP75vW5jICZNXEZcE4E1aHuln40Rr6GRDxavl2cdgkY5biwm00y4r3BBQr"); // Replace with your secret key

app.post("/create-checkout-session", async (req, res) => {
  if (!req.session.user || req.session.role !== "user") return res.status(401).send("Unauthorized");

  const userId = req.session.user.id;

  const sql = `
    SELECT 
      cart.product_id, cart.quantity, products.name, products.price
    FROM cart 
    JOIN products ON cart.product_id = products.id 
    WHERE cart.user_id = ?
  `;

  db.query(sql, [userId], async (err, cartItems) => {
    if (err || cartItems.length === 0) {
      return res.status(500).send("❌ Cart error or empty");
    }

    const lineItems = cartItems.map(item => ({
      price_data: {
        currency: "myr",
        product_data: {
          name: item.name,
        },
        unit_amount: item.price * 100,
      },
      quantity: item.quantity,
    }));

    try {
      const session = await stripeBackend.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: "payment",
        success_url: `http://localhost:3000/stripe-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `http://localhost:3000/checkout?cancel=true`,
        metadata: {
          user_id: userId
        }
      });

      res.json({ id: session.id });
    } catch (error) {
      console.error("Stripe session error:", error);
      res.status(500).send("❌ Failed to create Stripe session");
    }
  });
});

//Stripe Success
app.get("/stripe-success", async (req, res) => {
  if (!req.session.user || req.session.role !== "user") return res.redirect("/login");

  const stripe = require("stripe")("sk_test_51RXzCaICy91dN23racpcN8mS66xhxpFdDTWjCm41nP75vW5jICZNXEZcE4E1aHuln40Rr6GRDxavl2cdgkY5biwm00y4r3BBQr");
  const sessionId = req.query.session_id;
  const userId = req.session.user.id;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const orderNumber = "M" + Math.floor(10000 + Math.random() * 90000);


    // Prevent duplicate
    const checkSql = "SELECT id FROM orders WHERE order_number = ?";
    const exists = await new Promise((resolve) => {
      db.query(checkSql, [orderNumber], (err, result) => {
        resolve(result.length ? true : false);
      });
    });
    if (exists) return res.redirect(`/order?orderNumber=${orderNumber}`);

    // Get cart
    const sql = `
      SELECT cart.product_id, cart.quantity, cart.size, products.price, products.name
      FROM cart
      JOIN products ON cart.product_id = products.id
      WHERE cart.user_id = ?
    `;

    db.query(sql, [userId], (err, cartItems) => {
      if (err || cartItems.length === 0) return res.send("❌ Cannot place order");

      let total = 0;
      cartItems.forEach(item => total += item.price * item.quantity);

      const orderSql = `
        INSERT INTO orders (user_id, total, name, address, postcode, phone, payment_method, order_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const name = req.session.user.name;
      const email = req.session.user.email;
      const address = "Provided via Stripe";
      const postcode = "N/A";
      const phone = "N/A";

      db.query(orderSql, [userId, total, name, address, postcode, phone, "Credit/Debit Card", orderNumber], (err, result) => {
        if (err) return res.status(500).send("❌ Failed to save order");

        const orderId = result.insertId;
        const orderItems = cartItems.map(item => [orderId, item.product_id, item.quantity, item.price]);

        db.query("INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ?", [orderItems], (err) => {
          if (err) return res.status(500).send("❌ Failed to save items");

          // update stock
          const updatePromises = cartItems.map(item => {
            return new Promise((resolve, reject) => {
              const sql = `UPDATE product_stock SET stock = stock - ? WHERE product_id = ? AND size = ?`;
              db.query(sql, [item.quantity, item.product_id, item.size], (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
          });

          Promise.all(updatePromises).then(() => {
            db.query("DELETE FROM cart WHERE user_id = ?", [userId], (err) => {
              if (err) return res.status(500).send("❌ Failed to clear cart");

              // ✅ Email confirmation
              const emailHtml = `
                <h2>✅ Order Placed Successfully!</h2>
                <p><strong>Order No:</strong> ${orderNumber}</p>
                <p><strong>Payment:</strong> Credit/Debit Card (Stripe)</p>
                <p><strong>Total:</strong> RM${total}</p>
                <hr>
                <h4>🛍 Items Ordered:</h4>
                <ul>
                  ${cartItems.map(item => `<li>${item.name} (Size: ${item.size}) — Qty: ${item.quantity} — RM${item.price}</li>`).join("")}
                </ul>
                <p>Thank you for shopping with Tasha Enterprise!</p>
              `;

              transporter.sendMail({
                from: "Tasha Enterprise <yourgmail@gmail.com>",
                to: email,
                subject: `🧾 Order Confirmation - ${orderNumber}`,
                html: emailHtml
              }, (err, info) => {
                if (err) console.error("❌ Email error:", err);
                else console.log("✅ Email sent:", info.response);
                return res.redirect(`/order?orderNumber=${orderNumber}`);
              });
            });
          });
        });
      });
    });
  } catch (error) {
    console.error("❌ Stripe success handler error:", error);
    res.status(500).send("❌ Stripe payment failed");
  }
});

//Chatbot
// ✅ Node.js Chatbot API endpoint using OpenAI v5+

// ✅ Node.js Chatbot API endpoint using OpenAI v5+
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: "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" // replace with your actual key
});

const systemPrompt = `
You are TASHA, the smart assistant for Tasha Enterprise — an online fashion store based in Bangladesh and Malaysia.

Your job is to help customers navigate the website, find products, resolve checkout issues, and track orders.

Key Website Features:
- Customers can sign up and log in.
- They can browse by gender (Men, Women, Kids) and filter categories like New In, Sale, Clothing, Shoes, Accessories, and Bags.
- Every product has multiple images, sizes (like S/M/L or shoe sizes), and stock availability.
- Each product page allows customers to select a size, see if stock is low or out, and adjust quantity.
- Customers can use a **Virtual Try-On** feature by uploading their photo to see how clothing items look on them.
- Users can add items to the cart and checkout using **Stripe** (for debit/credit card) or **Cash on Delivery (COD)**.
- During checkout, users can autofill saved addresses and choose a payment method.
- After placing an order, customers receive a confirmation email.
- They can view past orders under the **My Orders** section in their account.
- Admins can manage products and update order statuses such as "Processing", "Shipped", "Delivered", "Cancelled", or "Refunded".
- There's also a chatbot button on all pages for quick help.

How to Assist:
- Help users find specific products by name, category, or gender.
- Suggest how to use filters or navigate product listings.
- Explain how to add to cart, check stock, or select sizes.
- Guide users on how to proceed with checkout and select payment methods.
- Help with virtual try-on upload issues or explain how it works.
- Support order tracking: tell them where to find order status and confirmation.
- Assist with login, signup, or forgotten password queries.
- Politely redirect to Contact Us page if users ask about refunds, delivery issues, or support.

Tone:
- Friendly, clear, helpful, and on-brand.
- Keep replies short and focused.
- Never ask for passwords or sensitive info.

You're here to make the shopping experience easier and more enjoyable for customers.
`;



app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "Missing user message." });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ]
    });

    const reply = response.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error("Chatbot error:", error);
    res.status(500).json({ error: "Failed to get chatbot response." });
  }
});



// ✅ Virtual Try-On with FASHN.ai (Fixed with /status/:id)
app.post("/api/fashn-tryon", async (req, res) => {
  let { modelImageUrl, garmentImageUrl, category } = req.body;

  try {
    // ✅ Upload garment image to ImgBB if it's a relative local path
    if (garmentImageUrl.startsWith("/uploads/")) {
      const fullGarmentPath = path.join(__dirname, "public", garmentImageUrl);
      garmentImageUrl = await uploadToImgBB(fullGarmentPath);
    }

    // ✅ Upload model image to ImgBB if it's a relative local path
if (modelImageUrl.startsWith("/uploads/")) {
  const fullModelPath = path.join(__dirname, "public", modelImageUrl);
  modelImageUrl = await uploadToImgBB(fullModelPath);
}


    // ✅ Proceed with FASHN.ai try-on using the hosted image URLs
    const postResp = await axios.post(
      "https://api.fashn.ai/v1/run",
      {
        model_image: modelImageUrl,
        garment_image: garmentImageUrl,
        category: category || "auto",
        mode: "balanced",
        segmentation_free: true,
        moderation_level: "permissive",
        garment_photo_type: "auto",
        num_samples: 1
      },
      {
        headers: {
          Authorization: `Bearer fa-zjKuEECRjNs2-gE44iZTehi6GpiPgv2yi6h3Q`
        }
      }
    );

    const { id, error } = postResp.data;
    if (error || !id) throw new Error(error || "No ID returned");

    const statusUrl = `https://api.fashn.ai/v1/status/${id}`;
    let statusData;

    for (let i = 0; i < 50; i++) {
      await new Promise(r => setTimeout(r, 2000));
      statusData = (await axios.get(statusUrl, {
        headers: { Authorization: `Bearer fa-zjKuEECRjNs2-gE44iZTehi6GpiPgv2yi6h3Q` }
      })).data;

      if (statusData.status === "completed") {
        const outputUrl = statusData.output?.[0];
        return res.json({ success: true, image: outputUrl });
      } else if (statusData.status === "failed") {
        return res.status(500).json({ error: `❌ Try-on failed: ${statusData.error?.message}` });
      }
    }

    return res.status(500).json({ error: "❌ Try-on timed out" });

  } catch (err) {
    console.error("Try-on error:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

app.get("/about-us", (req, res) => {
  getCartCount(req.session.user?.id || 0, (cartCount) => {
    res.render("about-us", {
      user: req.session.user,
      role: req.session.role,
      cartCount,
    });
  });
});

app.get("/contact-us", (req, res) => {
  getCartCount(req.session.user?.id || 0, (cartCount) => {
    res.render("contact-us", {
      user: req.session.user,
      role: req.session.role,
      cartCount,
    });
  });
});



// ✅ Start Server
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});

