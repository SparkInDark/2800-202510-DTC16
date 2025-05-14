// ==== Section 1. Load environment variables FIRST ====
require('dotenv').config();

// Firebase Functions config; safe to include even if not deploying to Firebase
const functions = require('firebase-functions');

// ==== Section 2. Then require other modules ====
const express = require("express");
const session = require('express-session')
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcrypt');
const multer = require("multer");
const axios = require('axios');
const { getWeather } = require("./services/weather");
const upload = multer({ storage: multer.memoryStorage() }); // Store file in memory

// ==== Section 3. Define constants ====
const app = express();
const port = 3000;
const saltRounds = 10;

// ==== Section 4. Define schema ====
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password_hash: { type: String, required: true },
    role: {
        type: String,
        enum: ['admin', 'user'],
        default: 'user'
    },
    profile: {
        first_name: { type: String, default: '' },
        last_name: { type: String, default: '' },
        city: { type: String, default: '' },
        country: { type: String, default: '' },
        bio: { type: String, default: '' },
        profile_photo_url: { type: String, default: '' }
    }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const usersModel = mongoose.model('users', userSchema);


const reviewSchema = new mongoose.Schema({
    product_name: String,
    user_email: String,
    review_text: {
        overall: String,
        pros: [String],
        cons: [String]
    },
    review_images: [String],
    votes: {
        upvotes: [String],
        downvotes: [String]
    },
    moderation: {
        status: String,
        flags: [mongoose.Schema.Types.Mixed],
        rejection_reason: mongoose.Schema.Types.Mixed // can be String or null
    }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const reviewsModel = mongoose.model('reviews', reviewSchema);


const ratingSchema = new mongoose.Schema({
    product_name: String,
    user_email: String,
    rating: Number
}, { timestamps: { createdAt: 'rated_at', updatedAt: false } }); // Only track rated_at

const ratingsModel = mongoose.model('ratings', ratingSchema);


const productSchema = new mongoose.Schema({
    name: String,
    category_slug: String,
    specs: {
        brand: String,
        storage: String,
        ram: String,
        screen_size: String,
        processor: String
    },
    images: [String],
    rating_summary: {
        average: Number,
        total_ratings: Number,
        star_counts: {
            "1": Number,
            "2": Number,
            "3": Number,
            "4": Number,
            "5": Number
        }
    }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const productsModel = mongoose.model('products', productSchema);


const categorySchema = new mongoose.Schema({
    name: String,
    slug: String,
    description: String
});

const categoriesModel = mongoose.model('categories', categorySchema);

// Comment by jun, the section is to be deleted after userSchema test.
// const user_authSchema = new mongoose.Schema({
//     username: String,
//     password: String,
//     role: {
//         type: String,
//         enum: ['admin', 'user'],
//         default: 'user'
//     }
// });
// const userAuthModel = mongoose.model('users_auth', user_authSchema);


// ==== Section 5. App settings (app.set, view engine and views directory) ====
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'));

// ==== Section 6. Middleware (app.use) ====

// Middleware to parse URL-encoded bodies (form submissions)
app.use(express.urlencoded({ extended: true }));

// Middleware to handle user sessions
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: true,
    saveUninitialized: true,
    cookie: { secure: false }
}))

// Middleware to serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '..', 'public')));


// ==== Section 7. Locals: Set res.locals for all views (user info) ====
// Notes: Setting res.locals here ensures that every route and view has access to the user variable.
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});


// ==== Section 8. End-point routes organized by feature with pairs of (app.get, app.post, app.delete) ====

// Redirect root URL '/' to '/home'
app.get('/', (req, res) => {
    res.redirect('/home');
})

// Home route
app.get('/home', (req, res) => {
    console.log(req.session.user);
    res.render('index', { weather: null, user: req.session.user });
});

// Weather route for AJAX weather fetch
app.get('/weather', async (req, res) => {
    const lat = req.query.lat;
    const lon = req.query.lon;
    if (!lat || !lon) {
        return res.status(400).json({ error: 'Missing coordinates' });
    }
    try {
        const weather = await getWeather(lat, lon);
        res.json(weather);
    } catch (e) {
        res.status(500).json({ error: 'Unable to fetch weather data' });
    }
});

// Register route
app.get('/register', (req, res) => {
    res.render('register.ejs');
})

// use { email: req.session.user.email}, but not username
app.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if the email already exists in MongoDB
        const userExists = await usersModel.findOne({ email: email });
        if (userExists) {
            return res.status(400).send('Email already exists');
        }

        // Hash the password
        // const saltRounds = 10   // Make sure saltRounds is defined
        // This is already set in top level together with global consts, keept it here for learning purpose
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Save the new user
        const newUser = await usersModel.create({
            email: email,
            password_hash: hashedPassword,
            role: 'user',
            created_at: new Date(),
            profile: {}
        });

        // Set session
        req.session.user = {
            email: newUser.email,
            role: newUser.role
        };

        // Redirect
        res.redirect('/home');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error registering user');
    }
});

// login route
app.get('/login', (req, res) => {
    res.render('login.ejs');
})

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    // Find the user by username
    const user = await usersModel.findOne({ email: email });

    // Check if user exists
    if (!user) {
        return res.status(401).send('Invalid credentials');
    }

    // Compare password using bcrypt
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
        return res.status(401).send('Invalid credentials');
    }

    // Set session data
    req.session.user = {
        email: user.email,
        role: user.role
    };

    // Redirect to the home page
    res.redirect('/home');
});

// logout route
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/home');
        }
        res.clearCookie('connect.sid'); // replace with the name of your session cookie
        res.redirect('/home');
    });
})

// profile route
app.get('/profile', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    const user = await usersModel.findOne({ email: req.session.user.email });
    res.render('profile.ejs', { user });
});

app.post('/profile/upload-photo', upload.single('profile_photo'), async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    if (!req.file) return res.status(400).send('No file uploaded');

    try {
        // Convert buffer to base64
        const imageBase64 = req.file.buffer.toString('base64');

        // Upload to imgbb
        const response = await axios.post('https://api.imgbb.com/1/upload', null, {
            params: {
                key: process.env.IMGBB_API_KEY,
                image: imageBase64
            }
        });

        const imageUrl = response.data.data.url;

        // Update user profile in DB
        await usersModel.updateOne(
            { email: req.session.user.email },
            { $set: { 'profile.profile_photo_url': imageUrl } }
        );

        res.redirect('/profile');
    } catch (err) {
        console.error(err);
        res.status(500).send('Image upload failed');
    }
});

// category route
app.get('/category', (req, res) => {
    res.render('category.ejs');
})

// product route
app.get('/product', (req, res) => {
    res.render('product.ejs');
})

app.get('/product/:productName', (req, res) => {
    const productName = req.params.productName;
    res.render('productdetail.ejs', { productName });
})

// write-review route
app.get('/write-review', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.render('write_review.ejs');
});

// search route
app.get('/search', async (req, res) => {
    const query = req.query.q || '';

    try {
        // 模糊查找产品（根据名称）
        const results = await productsModel.find({
            name: { $regex: query, $options: 'i' }
        });

        // 获取分类列表（右侧使用）
        const categories = await productsModel.distinct('category_slug');

        res.render('search', {
            query,
            results,
            categories: categories.map(cat => ({
                name: cat,
                slug: cat.toLowerCase().replace(/\s+/g, '-')
            }))
        });
    } catch (err) {
        console.error('Error during search:', err);
        res.status(500).send('Search failed');
    }
});


// feature product route

const getTopProducts = async (limit) => {
    return productsModel.find().sort({ rating: -1 }).limit(limit)
}

app.get('/featureproduct', (req, res) => {
    res.render('featureproduct'); // 确保 views/featureproduct.ejs 存在
});


app.get('/TopProducts/:limit', async (req, res) => {
    const limit = parseInt(req.params.limit); // Convert string to number

    if (isNaN(limit) || limit <= 0) {
        return res.status(400).json({ error: 'Limit must be a positive number' });
    }

    try {
        const topProducts = await productsModel.find()
            .sort({ rating: -1 })
            .limit(limit);

        res.status(200).json(topProducts);
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Failed to fetch product details' });
    }
});






// Anything else should be putting above  ( before DB Connector and Start-Server)


// ==== Section 9. Connect to MongoDB ====
async function connectToMongoDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB connected');
    } catch (err) {
        console.error('Failed to connect to MongoDB:', err);
        process.exit(1); // Exit with error code if connection fails
    }
};

// ==== Section 10. Start the server
// Keep app.listen ALWAYS at the bottom of the page
// Connect to DB first, then start the server only after a successful DB connection.

// Helper to detect Firebase environment
function isFirebaseEnv() {
    return !!(process.env.FUNCTION_NAME || process.env.K_SERVICE || process.env.GCLOUD_PROJECT);
}

// Main startup logic
connectToMongoDB().then(() => {
    if (isFirebaseEnv()) {
        // Running in Firebase Cloud Functions if detects Firebase environment variables (set by Firebase runtime)
        exports.app = functions.https.onRequest(app);
    } else {
        // Running locally if failed to detect Firebase environment variables
        app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
        });
    }
});


//, role: req.session.user.role
    // const isAdmin = (req, res, next) => {
    //     if (req.session && req.session.user && req.session.user.role === 'admin') {
    //         return next();
    //     } else {
    //         res.status(403).send('Forbidden');
    //     }
    // }

    // app.use(isAdmin);

