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
const top10products = require('./services/top10product'); // 注意路径

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
    },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const usersModel = mongoose.model('users', userSchema);


const reviewSchema = new mongoose.Schema({
    product_slug: { type: String, required: true  },
    user_email: { type: String, required: true },
    review_rating: { type: Number, min: 1, max: 5, required: true },
    review_text: { type: String, required: true },
    review_images: {
        type: [String],
        validate: [arr => arr.length <= 4, 'You can upload up to 4 images only.']
    },
    votes: {
        upvotes: [String],    // array of user IDs or emails who upvoted
        downvotes: [String]   // array of user IDs or emails who downvoted
    },
    moderation: {
        status: {
            type: String,
            enum: ['flagged', 'approved', 'rejected'],     // flagged for further review, reject make a review invisible
            default: 'approved'
        },
        flagged_by: [String],       // user emails
        rejection_reason: { type: String, default: '' }   // optional, only for rejected
    },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });   // if update tim = create time, then use upate, if update time is newer, use upated time

const reviewsModel = mongoose.model('reviews', reviewSchema);


const ratingSchema = new mongoose.Schema({
    product_slug: { type: String, required: true },
    user_email: { type: String, required: true },
    rating: { type: Number, min: 1, max: 5, required: true }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const ratingsModel = mongoose.model('ratings', ratingSchema);


const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true },
    category_slug: { type: String, required: true },
    specs: { type: mongoose.Schema.Types.Mixed, default: {} }, // flexible key-value
    images: [String], // URLs from imgbb
    rating_summary: {
        average: { type: Number, default: 0 },
        total_ratings: { type: Number, default: 0 },
        star_counts: {
            "1": { type: Number, default: 0 },
            "2": { type: Number, default: 0 },
            "3": { type: Number, default: 0 },
            "4": { type: Number, default: 0 },
            "5": { type: Number, default: 0 }
        }
    },
});

const productsModel = mongoose.model('products', productSchema);


const categorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true },
    description: { type: String, default: '' },
    specs: [String], // List of allowed spec keys for this category
});

const categoriesModel = mongoose.model('categories', categorySchema);



// ===  schema design review reference  (comment by jun, to be reviewed) ===

// const userSchema = new mongoose.Schema({
//     email: { type: String, required: true, unique: true },
//     password_hash: { type: String, required: true },
//     role: {
//         type: String,
//         enum: ['admin', 'user'],
//         default: 'user'
//     },
//     profile: {
//         first_name: { type: String, default: '' },
//         last_name: { type: String, default: '' },
//         city: { type: String, default: '' },
//         country: { type: String, default: '' },
//         bio: { type: String, default: '' },
//         profile_photo_url: { type: String, default: '' }
//     }
// }, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });
//
// const usersModel = mongoose.model('users', userSchema);
//
// const reviewSchema = new mongoose.Schema({
//     productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
//     userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
//     stars: { type: Number, min: 1, max: 5, required: true },
//     title: { type: String, required: true },
//     pros: String,
//     cons: String,
//     details: { type: String, required: true },
//     images: [String], // Store image URLs or file paths
//     createdAt: { type: Date, default: Date.now }
// });
//
// const reviewsModel = mongoose.model('reviews', reviewSchema);
//
// const ratingSchema = new mongoose.Schema({
//     product_name: String,
//     user_email: String,
//     rating: Number
// }, { timestamps: { createdAt: 'rated_at', updatedAt: false } }); // Only track rated_at
//
// const ratingsModel = mongoose.model('ratings', ratingSchema);
//
//
// const productSchema = new mongoose.Schema({
//     name: String,
//     category_slug: String,
//     specs: {
//         brand: String,
//         storage: String,
//         ram: String,
//         screen_size: String,
//         processor: String
//     },
//     images: [String],
//     rating_summary: {
//         average: Number,
//         total_ratings: Number,
//         star_counts: {
//             "1": Number,
//             "2": Number,
//             "3": Number,
//             "4": Number,
//             "5": Number
//         }
//     }
// }, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });
//
// const productsModel = mongoose.model('products', productSchema);
//
//
// const categorySchema = new mongoose.Schema({
//     name: String,
//     slug: String,
//     description: String
// });
//
// const categoriesModel = mongoose.model('categories', categorySchema);




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


/*
Comment out by jun, this line of code takes over all uploading behavior (body parse) before Multer can access it,
it works on local live server, but not on firebase as per documentation https://github.com/expressjs/multer/issues/799
Therefore,
remove these global middleware:
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
Instead,
use body parse in individual route selectively as below:
app.post('/some-text-form', express.urlencoded({ extended: true }), (req, res)
app.post('/some-json-api', express.json(), (req, res) =>
app.post('/profile/edit', upload.any(), (req, res) =>
*/
// Middleware to parse URL-encoded bodies (form submissions)
// app.use(express.urlencoded({ extended: true }));


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
app.post('/register', express.urlencoded({ extended: true }), async (req, res) => {
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

app.post('/login', express.urlencoded({ extended: true }), async (req, res) => {
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
        _id: user._id,
        email: user.email,
        role: user.role,
        profile: user.profile
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

app.post('/logout', express.urlencoded({ extended: true }), (req, res) => {
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
    try {
        const user = await usersModel.findOne({ email: req.session.user.email }).lean();
        res.render('profile.ejs', {
            user: {
                ...user,
                profile: user.profile || {}
            }
        });
    } catch (err) {
        console.error('Profile load error:', err);
        res.status(500).send('Error loading profile');
    }
});

app.post('/profile/edit', upload.any(), async (req, res) => {
    const { email, first_name, last_name, city, country, bio, password, confirm_password, delete_photo } = req.body;
    let updateData = {
        'profile.first_name': first_name,
        'profile.last_name': last_name,
        'profile.city': city,
        'profile.country': country,
        'profile.bio': bio
    };

    // Handle email change (check for duplicates)
    if (email !== req.session.user.email) {
        const emailExists = await usersModel.findOne({ email });
        if (emailExists) {
            return res.status(400).send('Email already in use by another account.');
        }
        updateData.email = email;
    }

    // Handle password change
    if (password && password.length > 0) {
        if (password !== confirm_password) {
            return res.status(400).send('Passwords do not match.');
        }
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        updateData.password_hash = hashedPassword;
    }

    // Handle soft photo deletion
    if (delete_photo === '1') {
        updateData['profile.profile_photo_url'] = '';
    }

    // Handle photo upload (overrides deletion if both present)
    // Following the change from app.post('/profile/edit', upload.single('profile_photo') to app.post('/profile/edit', upload.any(),
    // Add profile_photo definition to here to handle ejs page Form Action name "profile_photo"
    const profilePhoto = req.files.find(f => f.fieldname === 'profile_photo');
    if (profilePhoto) {
        try {
            const imageUrl = await uploadImageToImgbb(
                profilePhoto.buffer,
                profilePhoto.originalname
            );
            updateData['profile.profile_photo_url'] = imageUrl;
        } catch (err) {
            console.error('Image upload error:', err);
            return res.status(500).send('Image upload failed');
        }
    }

    try {
        await usersModel.updateOne(
            { email: req.session.user.email },
            { $set: updateData }
        );
        // Update session with new email if changed
        req.session.user.email = email;
        res.redirect('/profile');
    } catch (err) {
        console.error('Profile update error:', err);
        res.status(500).send('Profile update failed');
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


// Write-review get route
app.get('/write-review', async (req, res) => {
    const { category_slug, product_slug } = req.query;
    const categories = await categoriesModel.find({});
    let products = [];
    if (category_slug) {
        products = await productsModel.find({ category_slug });
    }
    res.render('write_review.ejs', {
        categories,
        products,
        category_slug,
        product_slug,
        user_email: req.session.user ? req.session.user.email : ''
    });
});


// Write Review POST Route
app.post('/write-review', upload.any(), async (req, res) => {
    try {
        const { product_slug, user_email, review_rating, review_text } = req.body;
        const rating = Number(review_rating);

        if (!product_slug || !user_email || !rating || !review_text) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Build review_images array: 4 slots, matching the grid order
        let review_images = [];
        for (let i = 0; i < 4; i++) {
            // Check for soft-delete flag
            if (req.body[`delete_image_${i}`] === 'true') {
                review_images[i] = null;
                continue;
            }
            // If a new image was uploaded in this slot
            const field = `review_image_${i}`;
            const file = req.files.find(f => f.fieldname === field);
            if (file) {
                try {
                    const url = await uploadImageToImgbb(file.buffer, file.originalname);
                    review_images[i] = url;
                } catch (uploadErr) {
                    // Respond immediately with an error and stop further processing
                    return res.status(500).json({ error: 'Image upload failed', details: uploadErr.message });
                }
            } else {
                review_images[i] = null; // No image uploaded and not marked for delete
            }
        }

        // Optionally: remove nulls if you want a compact array
        review_images = review_images.filter(url => url);

        const review = new reviewsModel({
            product_slug,
            user_email,
            review_rating,
            review_text,
            review_images
        });

        await review.save();
        const product = await productsModel.findOne({ slug: product_slug });
        let category = null;
        if (product && product.category_slug) {
            category = await categoriesModel.findOne({ slug: product.category_slug });
        }
        res.status(201).json({
            message: 'Review submitted successfully',
            review: {
                ...review.toObject(),
                product_name: product ? product.name : product_slug,
                category_name: category ? category.name : ''
            }
        });
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
                from: 'products',
                localField: 'product_slug',
                foreignField: 'slug',
                as: 'productInfo'
            }
        },
        {
            $addFields: {
                product_name: { $arrayElemAt: ['$productInfo.name', 0] }
            }
        },
        {
            $lookup: {
                from: 'ratings',
                let: { product_slug: '$product_slug', user_email: '$user_email' },
                pipeline: [
                    { $match: { $expr: { $and: [
                                    { $eq: ['$product_slug', '$$product_slug'] },
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
        },
        { $project: { productInfo: 0, ratingInfo: 0 } }
    ]);
    res.render('admin-review', { reviews });
});


app.get('/admin/review/:id', async (req, res) => {
    const review = await reviewsModel.findById(req.params.id).lean();
    const user = await usersModel.findOne({ email: review.user_email }).lean();
    const rating = await ratingsModel.findOne({ product_slug: review.product_slug, user_email: review.user_email });
    const product = await productsModel.findOne({ slug: review.product_slug }).lean();
    res.render('admin-review-detail', {
        review: {
            ...review,
            rating: rating ? rating.rating : 0,
            user_first_name: user?.profile?.first_name || '',
            user_last_name: user?.profile?.last_name || '',
            review_text: review.review_text,
            product_name: product ? product.name : review.product_slug         // show product name through slug
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
        },
        {
            $project: { cat: 0 }
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

app.post('/admin/product/:id/edit', upload.any(), async (req, res) => {
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
        // Find the file in req.files array with the correct fieldname
        const file = req.files.find(f => f.fieldname === field);
        if (file) {
            const url = await uploadImageToImgbb(file.buffer, file.originalname);
            product.images[i] = url;
        }
    }
    await product.save();
    res.redirect(`/admin/product/${product._id}`);
});


// === ADMIN CATEGORY ===

// Admin CAT Central Page
app.get('/admin/cat', (req, res) => {
    res.render('admin-cat');
});

app.get('/admin/cat/category', async (req, res) => {
    const categories = await categoriesModel.aggregate([
        {
            $lookup: {
                from: 'products',
                localField: 'slug',
                foreignField: 'category_slug',
                as: 'products'
            }
        },
        {
            $addFields: { product_count: { $size: '$products' } }
        }
    ]);
    res.render('admin-cat-category', { categories });
});



// Admin CAT CATEGORY

// Auto-generate slug while adding category
function slugify(str) {
    return str
        .toString()
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

app.post('/admin/cat/category/add', express.urlencoded({ extended: true }), async (req, res) => {
    const slug = slugify(req.body.name);
    await categoriesModel.create({
        name: req.body.name,
        slug: slug,
        description: req.body.description,
        specs: []
    });
    res.redirect('/admin/cat/category');
});

app.post('/admin/cat/category/:id/edit', express.urlencoded({ extended: true }), async (req, res) => {
    if (req.body.delete === "1") {
        // Actually delete the category from the database
        await categoriesModel.deleteOne({ _id: req.params.id });
        return res.redirect('/admin/cat/category');
    }
    // Otherwise, just update the category
    const category = await categoriesModel.findById(req.params.id);
    category.name = req.body.name;
    category.slug = req.body.slug;
    category.description = req.body.description;
    await category.save();
    res.redirect('/admin/cat/category');
});



// === ADMIN CAT PRODUCT ===

app.get('/admin/cat/product', async (req, res) => {
    const categories = await categoriesModel.find().lean();
    const products = await productsModel.find().lean();
    res.render('admin-cat-product', { categories, products });
});

app.post('/admin/cat/product/add', express.urlencoded({ extended: true }), async (req, res) => {
    const slug = slugify(req.body.name);
    await productsModel.create({
        name: req.body.name,
        slug: slug,
        category_slug: req.body.category_slug,
        specs: {},
        images: []
    });
    res.redirect('/admin/cat/product');
});

app.post('/admin/cat/product/:id/edit', express.urlencoded({ extended: true }), async (req, res) => {
    if (req.body.delete === "1") {
        await productsModel.deleteOne({ _id: req.params.id });
        return res.redirect('/admin/cat/product');
    }
    const product = await productsModel.findById(req.params.id);
    product.name = req.body.name;
    product.category_slug = req.body.category_slug;
    await product.save();
    res.redirect('/admin/cat/product');
});


// === ADMIN CAT SPEC ===

app.get('/admin/cat/spec', async (req, res) => {
    const categories = await categoriesModel.find().lean();
    res.render('admin-cat-spec', { categories });
});

app.post('/admin/cat/spec/add', express.urlencoded({ extended: true }), async (req, res) => {
    await categoriesModel.updateOne(
        { slug: req.body.category_slug },
        { $addToSet: { specs: req.body.spec_key } }
    );
    res.redirect('/admin/cat/spec');
});

app.post('/admin/cat/spec/:slug/edit', express.urlencoded({ extended: true }), async (req, res) => {
    const cat = await categoriesModel.findOne({ slug: req.params.slug });
    if (req.body.delete !== undefined && req.body.delete !== "") {
        cat.specs.splice(Number(req.body.delete), 1);
    } else if (req.body.spec_key !== undefined) {
        // for optionally handle spec key editing - might use - keep it for now
        cat.specs[Number(req.body.idx)] = req.body.spec_key;
    }
    await cat.save();
    res.redirect('/admin/cat/spec');
});


// === ADMIN CAT PRODUCT DETAIL ===

app.get('/admin/cat/product-detail', async (req, res) => {
    const products = await productsModel.find().lean();
    const categories = await categoriesModel.find().lean();
    let selectedProduct = products[0];

    if (req.query.product_id) {
        selectedProduct = products.find(p => p._id.toString() === req.query.product_id);
    }

    if (!selectedProduct) {
        // No valid product found, show error or redirect
        return res.status(404).render('component/error-no-product-found', { message: 'Product database is empty' });
        // Or: return res.redirect('/admin/cat/product-detail');
    }

    const cat = categories.find(c => c.slug === selectedProduct.category_slug);
    const productSpecs = cat ? cat.specs : [];
    res.render('admin-cat-product-detail', { products, categories, selectedProduct, productSpecs });
});


app.post('/admin/cat/product-detail', upload.any(), async (req, res) => {
    const product = await productsModel.findById(req.body.product_id);
    if (req.body.delete) {
        await product.deleteOne();
        return res.redirect('/admin/cat/product-detail');
    }
    product.category_slug = req.body.category_slug;
    product.specs = req.body.specs || {};

    // Handle multiple image deletions from images_to_delete
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
        // Find the file in req.files array with the correct fieldname
        const file = req.files.find(f => f.fieldname === field);
        if (file) {
            const url = await uploadImageToImgbb(file.buffer, file.originalname);
            product.images[i] = url;
        }
    }
    await product.save();
    res.redirect(`/admin/cat/product-detail?product_id=${product._id}`);
});


// === ADMIN USER ===

app.get('/admin/user', async (req, res) => {
    const users = await usersModel.find().lean();
    res.render('admin-user', { users });
});

app.get('/admin/user/:id', async (req, res) => {
    const user = await usersModel.findById(req.params.id).lean();
    res.render('admin-user-profile', { user });
});

app.post('/admin/user/:id/edit', upload.single('profile_pic'), async (req, res) => {
    const user = await usersModel.findById(req.params.id);
    if (req.body.delete) {
        await user.deleteOne();
        return res.redirect('/admin/user');
    }
    if (req.body.delete_pic) {
        user.profile.profile_photo_url = '';
        await user.save();
        return res.redirect(`/admin/user/${user._id}`);
    }
    if (req.file) {
        const url = await uploadImageToImgbb(req.file.buffer, req.file.originalname);
        user.profile.profile_photo_url = url;
    }
    user.profile.first_name = req.body.first_name;
    user.profile.last_name = req.body.last_name;
    user.profile.city = req.body.city;
    user.profile.country = req.body.country;
    user.profile.bio = req.body.bio;
    if (req.body.password && req.body.password !== '****') {
        user.password_hash = await bcrypt.hash(req.body.password, 10);
    }
    await user.save();
    res.redirect(`/admin/user/${user._id}`);
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
