// ==== Section 1. Load environment variables FIRST ====
require('dotenv').config();

// Firebase Functions config; safe to include even if not deploying to Firebase
const functions = require('firebase-functions');

// ==== Section 2. Then require other modules ====
const express = require("express");
const session = require('express-session')
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');
const path = require('path');
const bcrypt = require('bcrypt');

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const top10products = require('../data/top10product'); // 注意路径

const { getWeather } = require("./services/weather");
const { upload, uploadImageToImgbb } = require('./services/imgupload');


// ==== Section 3. Define constants and helpers ====
const app = express();
const port = 3000;
const saltRounds = 10;

// Login protection list and isProtected helper
const protectedRoutes = ['/profile', '/write-review', '/vote', '/rate', '/admin'];
function isProtected(path) {
    return protectedRoutes.includes(path.split('?')[0]);
}


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

const ReviewSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    stars: { type: Number, min: 1, max: 5, required: true },
    title: { type: String, required: true },
    pros: String,
    cons: String,
    details: { type: String, required: true },
    images: [String], // Store image URLs or file paths
    createdAt: { type: Date, default: Date.now }
});

const reviewModel = mongoose.model('Review', ReviewSchema);

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

// This is required for hosting (firebase, render.com, Heroku, etc)
// Reason: In next section, https for cookie is enforced, however the internal traffic
// between hosting frontend to backend is still http, therefore proxy has to enable.
app.set('trust proxy', 1);

// Middleware to handle user sessions
app.use(session({
    secret: process.env.SESSION_SECRET,
    name: '__session',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),  // Added for persist session using connect-mongo
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    }
}))

// Middleware to serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// Middleware for page protection
// AFTER session and static, BEFORE Locals and routes
function requireLogin(req, res, next) {
    if (isProtected(req.path) && !req.session.user) {
        return res.redirect('/login');
    }
    next();
}
app.use(requireLogin);


// ==== Section 7. Locals: Set res.locals for all views (user info) ====
// Notes: Setting res.locals here ensures that every route and view has access to the global user variable.
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;            // get current user
    res.locals.currentUrl = req.originalUrl;               // get current page
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
    res.render('index', { weather: null });
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
        res.clearCookie('__session'); // Learning: if not set in middleware, default name is connect.sid
        res.redirect('/home');
    });
})

app.post('/logout', (req, res) => {
    const from = req.body.from || '/home';
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/home');
        }
        res.clearCookie('__session'); // Learning: if not set in middleware, default name is connect.sid
        // If the page is protected, redirect to home. Otherwise, redirect back to current page.
        if (isProtected(from)) {
            res.redirect('/home');
        } else {
            res.redirect(from);
        }
    });
});


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
// app.get('/search', async (req, res) => {
//     const query = req.query.q || '';

//     try {
//         // 模糊查找产品（根据名称）
//         const results = await productsModel.find({
//             name: { $regex: query, $options: 'i' }
//         });

//         // 获取分类列表（右侧使用）
//         const categories = await productsModel.distinct('category_slug');

//         res.render('search', {
//             query,
//             results,
//             categories: categories.map(cat => ({
//                 name: cat,
//                 slug: cat.toLowerCase().replace(/\s+/g, '-')
//             }))
//         });
//     } catch (err) {
//         console.error('Error during search:', err);
//         res.status(500).send('Search failed');
//     }
// });





///search function
app.get('/products/search', async (req, res) => {
    const { query } = req.query;
    const products = await productsModel.find({
        productname: { $regex: query, $options: 'i' }
    });
    res.json(products);
});

//
app.get('/top10products', (req, res) => {
    res.render('top10products', { products: top10products, user: req.session.user });
});


// AI MAGIC
app.post('/ai-welcome', express.json(), async (req, res) => {
    const prompt = `Give a short, interesting, and slightly playful product insight or review tip related to modern tech gadgets like graphics cards, smartphones, or camera gear.`;
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 80
        });
        const message = response.choices[0].message.content;
        res.json({ message });
    } catch (err) {
        console.error('🔥 OpenAI API Error:', err);
        res.status(500).json({ message: 'AI is having a coffee break ☕️' });
    }
});

///write review function
app.post('/reviews', async (req, res) => {
    const { productId, userId, stars, title, pros, cons, details } = req.body;

    if (!stars || !title || !details || !productId || !userId) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const review = new reviewModel({
            productId,
            userId,
            stars,
            title,
            pros,
            cons,
            details,
            images: [] // Add handling if you're including images
        });

        await reviewModel.save();
        res.status(201).json({ message: 'Review submitted successfully', review });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});




/*
This admin routes are being tested.
 */

// ======= ADMIN ROUTES (dedicated) =======


// === ADMIN REVIEW ===

app.get('/admin/review', async (req, res) => {
    const reviews = await reviewsModel.aggregate([
        { $sort: { created_at: -1 } },
        { $limit: 100 },
        {
            $lookup: {
                from: 'ratings',
                let: { product_name: '$product_name', user_email: '$user_email' },
                pipeline: [
                    { $match: { $expr: { $and: [
                                    { $eq: ['$product_name', '$$product_name'] },
                                    { $eq: ['$user_email', '$$user_email'] }
                                ] } } }
                ],
                as: 'ratingInfo'
            }
        },
        {
            $addFields: {
                rating: { $ifNull: [ { $arrayElemAt: ['$ratingInfo.rating', 0] }, 0 ] }
            }
        }
    ]);
    res.render('admin-review', { reviews });
});

app.get('/admin/review/:id', async (req, res) => {
    const review = await reviewsModel.findById(req.params.id).lean();
    const user = await usersModel.findOne({ email: review.user_email }).lean();
    const rating = await ratingsModel.findOne({ product_name: review.product_name, user_email: review.user_email });
    res.render('admin-review-detail', {
        review: {
            ...review,
            rating: rating ? rating.rating : 0,
            user_first_name: user?.profile?.first_name || '',
            user_last_name: user?.profile?.last_name || '',
            pros: review.review_text.pros || [],
            cons: review.review_text.cons || []
        }
    });
});

app.post('/admin/review/:id/delete', async (req, res) => {
    await reviewsModel.findByIdAndDelete(req.params.id);
    res.redirect('/admin/review');
});


// === ADMIN PRODUCT ===

app.get('/admin/product', async (req, res) => {
    const products = await productsModel.aggregate([
        { $sort: { created_at: -1 } },
        {
            $lookup: {
                from: 'categories',
                localField: 'category_slug',
                foreignField: 'slug',
                as: 'cat'
            }
        },
        {
            $addFields: {
                category_name: { $arrayElemAt: ['$cat.name', 0] }
            }
        }
    ]);
    res.render('admin-product', { products });
});

app.get('/admin/product/:id', async (req, res) => {
    const product = await productsModel.findById(req.params.id).lean();
    const categories = await categoriesModel.find().lean();

    if (!product) {
        // Product not found, show error or redirect
        return res.status(404).render('error-no-proudct-found', { message: 'Product not found' });
        // Or: return res.redirect('/admin/product');
    }

    const cat = categories.find(c => c.slug === product.category_slug);
    const productSpecs = cat ? cat.specs : [];
    res.render('admin-product-detail', { product, categories, productSpecs });
});

app.post('/admin/product/:id/edit',
    upload.fields([
        { name: 'new_image_0', maxCount: 1 },
        { name: 'new_image_1', maxCount: 1 },
        { name: 'new_image_2', maxCount: 1 },
        { name: 'new_image_3', maxCount: 1 }
    ]),
    async (req, res) => {
        const product = await productsModel.findById(req.params.id);
        if (req.body.delete) {
            await product.deleteOne();
            return res.redirect('/admin/product');
        }
        product.name = req.body.name;
        product.category_slug = req.body.category_slug;
        product.specs = req.body.specs || {};

        // NEW: Handle multiple image deletions from images_to_delete
        if (req.body.images_to_delete) {
            const indices = req.body.images_to_delete
                .split(',')
                .map(s => parseInt(s, 10))
                .filter(n => !isNaN(n));
            for (const idx of indices) {
                product.images[idx] = null;
            }
        }

        // Handle any new images
        for (let i = 0; i < 4; i++) {
            const field = `new_image_${i}`;
            if (req.files && req.files[field] && req.files[field][0]) {
                const file = req.files[field][0];
                const url = await uploadImageToImgbb(file.buffer, file.originalname);
                product.images[i] = url;
            }
        }
        await product.save();
        res.redirect(`/admin/product/${product._id}`);
    });




















// const isAdmin = (req, res, next) => {
//     if (req.session && req.session.user && req.session.user.role === 'admin') {
//         return next();
//     } else {
//         res.status(403).send('Forbidden');
//     }
// }

// app.use(isAdmin);



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

connectToMongoDB().then(() => {
    app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
    });
});
