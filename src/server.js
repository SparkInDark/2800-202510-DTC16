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
const busboy = require('busboy');
console.log('Busboy export:', busboy); // <--- Add this here, temporary for img upload troubleshooting

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const top10products = require('./services/top10product'); // 注意路径

const { getWeather } = require("./services/weather");
const { uploadImageToGCS } = require('./services/imgupload');


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
    product_slug: { type: String, required: true },
    user_email: { type: String, required: true },
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

ratingSchema.index({ product_slug: 1, user_email: 1 }, { unique: true }); // prevent duplicate ratings by the same user

const ratingsModel = mongoose.model('ratings', ratingSchema);


const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true },
    category_slug: { type: String, required: true },
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
    specs: { type: mongoose.Schema.Types.Mixed, default: {} }, // flexible key-value
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
app.get('/home', async (req, res) => {
    try {
        console.log(req.session.user);
        const categories = await categoriesModel.find()
        const topProducts = await productsModel.find()
            .sort({ 'rating_summary.average': -1 })
            .limit(3);

        res.render('index', { topProducts, categories });
    } catch (error) {
        console.error('Error fetching top products:', error);
        res.status(500).send('Internal Server Error');
    }
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

app.post('/profile/edit', (req, res) => {
    const bb = busboy({ headers: req.headers });
    const fields = {};
    let profilePhotoBuffer = null;
    let profilePhotoName = '';
    let profilePhotoMime = '';

    // Collect fields
    bb.on('field', (fieldname, val) => {
        fields[fieldname] = val;
    });

    // Collect file (if any)
    bb.on('file', (fieldname, file, info) => {
        const { filename, encoding, mimeType } = info;
        if (fieldname === 'profile_photo' && filename) {
            profilePhotoName = filename;
            profilePhotoMime = mimeType;
            // debug for GCP filename type is not a string issue
            // Debug: Check the filename and its type
            console.log('profilePhotoName assigned:', profilePhotoName, typeof profilePhotoName);
            const buffers = [];
            file.on('data', (data) => buffers.push(data));
            file.on('end', () => {
                profilePhotoBuffer = Buffer.concat(buffers);
                profilePhotoName = filename;
                profilePhotoMime = mimeType;
                // Debug: Confirm buffer and filename after file end
                console.log('File end. profilePhotoName:', profilePhotoName, typeof profilePhotoName);
            });
        } else {
            // Drain any other files
            file.resume();
        }
    });

    bb.on('finish', async () => {
        const { email, first_name, last_name, city, country, bio, password, confirm_password, delete_photo } = fields;
        let updateData = {
            'profile.first_name': first_name,
            'profile.last_name': last_name,
            'profile.city': city,
            'profile.country': country,
            'profile.bio': bio
        };

        // Handle email change (check for duplicates)
        if (email && email !== req.session.user.email) {
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
        if (profilePhotoBuffer && Buffer.isBuffer(profilePhotoBuffer) && profilePhotoBuffer.length > 0) {
            // Debug: Check filename values before upload
            console.log('About to upload:', profilePhotoName, typeof profilePhotoName);
            try {
                const imageUrl = await uploadImageToGCS(
                    profilePhotoBuffer,
                    profilePhotoName,
                    profilePhotoMime
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
            if (email) req.session.user.email = email;
            res.redirect('/profile');
        } catch (err) {
            console.error('Profile update error:', err);
            res.status(500).send('Profile update failed');
        }
    });

    // For Firebase, use req.rawBody; for normal Express, use req.pipe(busboy)
    if (req.rawBody) {
        bb.end(req.rawBody); // For Firebase Functions
    } else {
        req.pipe(bb);        // For normal Express (local, Render.com, etc.)
    }
});


// category route
app.get('/category', async (req, res) => {
    try {
        // Step 1: Fetch all categories from the database
        const categories = await categoriesModel.find({});

        // Step 2: For each category, fetch the products that belong to it
        const categoriesWithProducts = await Promise.all(
            categories.map(async (category) => {
                const products = await productsModel.find({ category_slug: category.slug });

                return {
                    ...category.toObject(), // Convert Mongoose document to plain JavaScript object
                    products, // Attach the list of products under this category
                };
            })
        );

        // Step 3: Render the EJS view and pass the data
        res.render('category', { categories: categoriesWithProducts });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
})

// product route
app.get('/product/:slug', async (req, res) => {
    try {
        const slug = req.params.slug;

        // Find product by slug
        const product = await productsModel.findOne({ slug });

        if (!product) {
            return res.status(404).send('Product not found');
        }

        // Get approved reviews for this product
        const reviews = await reviewsModel.find({
            product_slug: slug,
            'moderation.status': 'approved'
        }).sort({ created_at: -1 });

        // Get all ratings for this product
        const ratings = await ratingsModel.find({ product_slug: slug });

        // Create a map: { user_email => rating }
        const ratingMap = {};
        ratings.forEach(r => {
            ratingMap[r.user_email] = r.rating;
        });

        // Merge rating into each review (if available)
        const reviewsWithRatings = reviews.map(review => {
            const obj = review.toObject(); // convert from Mongoose Document to plain object
            obj.rating = ratingMap[review.user_email] || null; // attach rating if found
            return obj;
        });

        res.render('product', {
            product,
            reviews: reviewsWithRatings
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal Server Error');
    }
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

//
app.get('/top10products', async (req, res) => {
    try {
        const topProducts = await productsModel.find()
            .sort({ 'rating_summary.average': -1 })
            .limit(10);

        res.render('top10products', { topProducts });
    } catch (error) {
        console.error('Error fetching top products:', error);
        res.status(500).send('Internal Server Error');
    }
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
app.post('/write-review', (req, res) => {
    const bb = busboy({ headers: req.headers });
    const fields = {};
    const files = {};

    bb.on('field', (fieldname, val) => {
        fields[fieldname] = val;
    });

    bb.on('file', (fieldname, file, info) => {
        const { filename, mimeType } = info;
        if (filename) {
            const buffers = [];
            file.on('data', data => buffers.push(data));
            file.on('end', () => {
                files[fieldname] = {
                    buffer: Buffer.concat(buffers),
                    originalname: filename,
                    mimeType
                };
            });
        } else {
            file.resume();
        }
    });

    bb.on('finish', async () => {
        try {
            const { product_slug, user_email, review_rating, review_text } = fields;
            const rating = Number(review_rating);

            if (!product_slug || !user_email || !rating || !review_text) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // Handle review images
            let review_images = [];
            for (let i = 0; i < 4; i++) {
                if (fields[`delete_image_${i}`] === 'true') {
                    review_images[i] = null;
                    continue;
                }
                const field = `review_image_${i}`;
                const file = files[field];
                if (file && Buffer.isBuffer(file.buffer) && file.buffer.length > 0) {
                    try {
                        const url = await uploadImageToGCS(file.buffer, file.originalname, file.mimeType);
                        review_images[i] = url;
                    } catch (uploadErr) {
                        return res.status(500).json({ error: 'Image upload failed', details: uploadErr.message });
                    }
                } else {
                    review_images[i] = null;
                }
            }

            review_images = review_images.filter(Boolean);

            // Save review (without rating)
            const review = new reviewsModel({
                product_slug,
                user_email,
                review_text,
                review_images
            });
            await review.save();

            // Upsert rating
            await ratingsModel.findOneAndUpdate(
                { product_slug, user_email },
                { rating },
                { upsert: true, new: true }
            );

            // Recalculate product's ratings
            const ratings = await ratingsModel.find({ product_slug });

            const starCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
            let total = 0;
            ratings.forEach(r => {
                starCounts[r.rating] += 1;
                total += r.rating;
            });

            const totalRatings = ratings.length;
            const averageRating = totalRatings > 0 ? total / totalRatings : 0;

            await productsModel.findOneAndUpdate(
                { slug: product_slug },
                {
                    average_rating: averageRating,
                    total_ratings: totalRatings,
                    star_1_count: starCounts[1],
                    star_2_count: starCounts[2],
                    star_3_count: starCounts[3],
                    star_4_count: starCounts[4],
                    star_5_count: starCounts[5]
                }
            );

            const product = await productsModel.findOne({ slug: product_slug });
            let category = null;
            if (product?.category_slug) {
                category = await categoriesModel.findOne({ slug: product.category_slug });
            }

            res.status(201).json({
                message: 'Review and rating submitted successfully',
                review: {
                    ...review.toObject(),
                    product_name: product?.name || product_slug,
                    category_name: category?.name || ''
                }
            });
        } catch (err) {
            res.status(500).json({ error: 'Server error', details: err.message });
        }
    });

    if (req.rawBody) {
        bb.end(req.rawBody);
    } else {
        req.pipe(bb);
    }
});


//Rating Route
app.post('/rating', async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) return res.status(401).json({ error: 'User not logged in' });

        const { product_slug, rating } = req.body;
        if (!product_slug || !rating) {
            return res.status(400).json({ error: 'Missing product_slug or rating' });
        }

        const userEmail = user.email;

        // Check for existing rating
        await ratingsModel.findOneAndUpdate(
            { product_slug, user_email: userEmail },      // Filter
            { rating },                                   // Update
            { upsert: true, new: true }                   // Options: create if not found, return new doc
        );


        // After rating is added/updated, recalculate summary
        const ratings = await ratingsModel.find({ product_slug });

        const starCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        let total = 0;

        ratings.forEach(r => {
            starCounts[r.rating] += 1;
            total += r.rating;
        });

        const totalRatings = ratings.length;
        const averageRating = totalRatings > 0 ? total / totalRatings : 0;

        // Update product summary
        await productsModel.findOneAndUpdate(
            { slug: product_slug },
            {
                $set: {
                    'rating_summary.average': averageRating.toFixed(2),
                    'rating_summary.total_ratings': totalRatings,
                    'rating_summary.star_counts': starCounts
                }
            }
        );

        res.status(200).json({ success: true, message: 'Rating saved and summary updated' });

    } catch (err) {
        console.error('Error handling rating:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

//upvote and downvote route
app.post('/reviews/:id/vote', async (req, res) => {
    const reviewId = req.params.id;
    const { voteType } = req.body; // 'up' or 'down'
    const userEmail = req.session.user?.email;

    if (!userEmail) return res.status(401).json({ error: 'User not authenticated' });
    if (!['up', 'down'].includes(voteType)) return res.status(400).json({ error: 'Invalid vote type' });

    try {
        const review = await reviewsModel.findById(reviewId);
        if (!review) return res.status(404).json({ error: 'Review not found' });

        const { upvotes, downvotes } = review.votes || { upvotes: [], downvotes: [] };

        const hasUpvoted = upvotes.includes(userEmail);
        const hasDownvoted = downvotes.includes(userEmail);

        if (voteType === 'up') {
            if (hasUpvoted) {
                // Remove upvote (toggle)
                review.votes.upvotes.pull(userEmail);
            } else {
                review.votes.upvotes.push(userEmail);
                review.votes.downvotes.pull(userEmail); // Remove downvote if exists
            }
        } else {
            if (hasDownvoted) {
                // Remove downvote (toggle)
                review.votes.downvotes.pull(userEmail);
            } else {
                review.votes.downvotes.push(userEmail);
                review.votes.upvotes.pull(userEmail); // Remove upvote if exists
            }
        }

        await review.save();

        res.json({
            success: true,
            upvotes: review.votes.upvotes.length,
            downvotes: review.votes.downvotes.length
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
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ['$product_slug', '$$product_slug'] },
                                    { $eq: ['$user_email', '$$user_email'] }
                                ]
                            }
                        }
                    }
                ],
                as: 'ratingInfo'
            }
        },
        {
            $addFields: {
                rating: { $ifNull: [{ $arrayElemAt: ['$ratingInfo.rating', 0] }, 0] }
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

    // Merge product.specs with productSpecs (category spec keys)
    const mergedSpecs = {};
    for (const key of productSpecs) {
        mergedSpecs[key] = (product.specs && product.specs[key] !== undefined) ? product.specs[key] : "";
    }

    // Pass mergedSpecs to EJS
    res.render('admin-product-detail', { product, categories, productSpecs, mergedSpecs });

});

app.post('/admin/product/:id/edit', async (req, res) => {
    const bb = busboy({ headers: req.headers });
    const fields = {};
    const files = {}; // { new_image_0: { buffer, originalname }, ... }

    // Collect fields
    bb.on('field', (fieldname, val) => {
        // Parse nested fields like specs[KEY]
        const specMatch = fieldname.match(/^specs\[(.+)\]$/);
        if (specMatch) {
            fields.specs = fields.specs || {};
            fields.specs[specMatch[1]] = val;
        } else {
            fields[fieldname] = val;
        }
    });

    // Collect files
    bb.on('file', (fieldname, file, info) => {
        const { filename, encoding, mimeType } = info;
        if (filename) {
            const buffers = [];
            file.on('data', data => buffers.push(data));
            file.on('end', () => {
                files[fieldname] = {
                    buffer: Buffer.concat(buffers),
                    originalname: filename,
                    mimeType: mimeType
                };
            });
        } else {
            file.resume();
        }
    });

    bb.on('finish', async () => {
        try {
            const product = await productsModel.findById(req.params.id);

            if (fields.delete) {
                await product.deleteOne();
                return res.redirect('/admin/product');
            }

            product.name = fields.name;
            product.category_slug = fields.category_slug;

            // --- THE IMPORTANT PART: Sync specs with category spec keys ---

            // 1. Parse all specs from the form fields
            const specsFromForm = fields.specs || {};

            // 2. Get the latest spec keys for the product's (possibly changed) category
            const category = await categoriesModel.findOne({ slug: fields.category_slug });
            const specKeys = (category && Array.isArray(category.specs)) ? category.specs : [];

            // 3. Build the product.specs object so it has exactly the keys from the category
            const newSpecs = {};
            for (const key of specKeys) {
                newSpecs[key] = specsFromForm[key] || "";
            }
            product.specs = newSpecs;

            // --- END IMPORTANT PART ---

            // Handle multiple image deletions from images_to_delete
            if (fields.images_to_delete) {
                const indices = fields.images_to_delete
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
                const file = files[field];
                if (file && Buffer.isBuffer(file.buffer) && file.buffer.length > 0) {
                    const url = await uploadImageToGCS(file.buffer, file.originalname, file.mimeType);
                    product.images[i] = url;
                }
            }

            await product.save();
            res.redirect(`/admin/product/${product._id}`);
        } catch (err) {
            console.error('Admin product edit error:', err);
            res.status(500).send('Server error');
        }
    });

    // For Firebase Functions, use req.rawBody; for normal Express, use req.pipe(busboy)
    if (req.rawBody) {
        // For Firebase Functions and similar platforms
        bb.end(req.rawBody);
    } else {
        // For local Express, Render.com, etc.
        req.pipe(bb);
    }
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

app.post('/admin/cat/category/add', async (req, res) => {
    const slug = slugify(req.body.name);
    await categoriesModel.create({
        name: req.body.name,
        slug: slug,
        description: req.body.description,
        specs: []
    });
    res.redirect('/admin/cat/category');
});

app.post('/admin/cat/category/:id/edit', async (req, res) => {
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

app.post('/admin/cat/product/add', async (req, res) => {
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

app.post('/admin/cat/product/:id/edit', async (req, res) => {
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

app.post('/admin/cat/spec/add', async (req, res) => {
    await categoriesModel.updateOne(
        { slug: req.body.category_slug },
        { $addToSet: { specs: req.body.spec_key } }
    );
    // Add the new spec key to all products in this category
    await productsModel.updateMany(
        { category_slug: req.body.category_slug },
        { $set: { [`specs.${req.body.spec_key}`]: "" } }
    );
    res.redirect('/admin/cat/spec');
});

app.post('/admin/cat/spec/:slug/edit', async (req, res) => {
    const cat = await categoriesModel.findOne({ slug: req.params.slug });
    if (req.body.delete !== undefined && req.body.delete !== "") {
        // DELETE
        const deleteIdx = Number(req.body.delete);
        const deleteKey = cat.specs[deleteIdx];
        cat.specs.splice(deleteIdx, 1);
        await cat.save();
        // Remove key from all products
        await productsModel.updateMany(
            { category_slug: req.params.slug },
            { $unset: { [`specs.${deleteKey}`]: "" } }
        );
    } else if (req.body.spec_key !== undefined && req.body.old_key !== undefined) {
        // RENAME
        const idx = Number(req.body.idx);
        const oldKey = req.body.old_key;
        const newKey = req.body.spec_key;
        cat.specs[idx] = newKey;
        await cat.save();
        // Rename in all products
        const products = await productsModel.find({ category_slug: req.params.slug });
        for (const product of products) {
            if (product.specs && Object.prototype.hasOwnProperty.call(product.specs, oldKey)) {
                product.specs[newKey] = product.specs[oldKey];
                delete product.specs[oldKey];
                await product.save();
            }
        }
    }
    res.redirect('/admin/cat/spec');
});


// === ADMIN CAT PRODUCT DETAIL ===



app.get('/admin/product/add/product-detail', async (req, res) => {
    const products = await productsModel.find().lean();
    const categories = await categoriesModel.find().lean();

    let selectedProduct = null;
    let catSlug = req.query.category_slug || null;

    if (req.query.product_slug) {
        selectedProduct = products.find(p => p.slug === req.query.product_slug);
        catSlug = selectedProduct ? selectedProduct.category_slug : catSlug;

        console.log('Requested slug:', req.query.product_slug);
        console.log('All product slugs:', products.map(p => p.slug));

        if (!selectedProduct) {
            // Only show error if a specific product_slug was requested and not found
            return res.status(404).render('component/error-no-product-found', { message: 'Product not found' });
        }
    }

    const productSpecs = (categories.find(c => c.slug === catSlug) || {}).specs || [];
    res.render('admin-product-add', { products, categories, selectedProduct, productSpecs, catSlug });
});


app.post('/admin/product/add/product-detail', async (req, res) => {
    const bb = busboy({ headers: req.headers });
    const fields = {};
    const files = {}; // { new_image_0: { buffer, originalname }, ... }

    // Collect fields
    bb.on('field', (fieldname, val) => {
        fields[fieldname] = val;
    });

    // Collect files
    bb.on('file', (fieldname, file, info) => {
        const { filename, encoding, mimeType } = info;
        if (filename) {
            const buffers = [];
            file.on('data', data => buffers.push(data));
            file.on('end', () => {
                files[fieldname] = {
                    buffer: Buffer.concat(buffers),
                    originalname: filename,
                    mimeType: mimeType
                };
            });
        } else {
            file.resume();
        }
    });

    bb.on('finish', async () => {
        try {
            const product = await productsModel.findOne({ slug: fields.product_slug });
            if (!product) {
                return res.status(404).send('Product not found');
            }

            if (fields.delete) {
                await product.deleteOne();
                return res.redirect('/admin/product/add/product-detail');
            }

            product.category_slug = fields.category_slug;

// Parse all fields like specs[KEY]
            const specs = {};
            for (const key in fields) {
                const match = key.match(/^specs\[(.+)\]$/);
                if (match) {
                    specs[match[1]] = fields[key];
                }
            }

            // Get current category spec keys
            const category = await categoriesModel.findOne({ slug: product.category_slug });
            const specKeys = (category && Array.isArray(category.specs)) ? category.specs : [];

            // Ensure all category spec keys are present in product.specs
            for (const key of specKeys) {
                if (!(key in specs)) {
                    specs[key] = ""; // or null, or your preferred default
                }
            }

            // Optionally, remove keys not in category spec
            const cleanedSpecs = {};
            for (const key of specKeys) {
                cleanedSpecs[key] = specs[key];
            }
            product.specs = cleanedSpecs;

            // Defensive: ensure images is an array
            if (!Array.isArray(product.images)) product.images = [];

            // Handle multiple image deletions from images_to_delete
            if (fields.images_to_delete) {
                const indices = fields.images_to_delete
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
                const file = files[field];
                if (file && Buffer.isBuffer(file.buffer) && file.buffer.length > 0) {
                    const url = await uploadImageToGCS(file.buffer, file.originalname, file.mimeType);
                    product.images[i] = url;
                }
            }

            await product.save();
            res.redirect(`/admin/product/add/product-detail?product_slug=${product.slug}`);
        } catch (err) {
            console.error('Admin cat product-detail error:', err);
            res.status(500).send('Server error');
        }
    });

    // For Firebase Functions, use req.rawBody; for normal Express, use req.pipe(busboy)
    if (req.rawBody) {
        // For Firebase Functions and similar platforms
        bb.end(req.rawBody);
    } else {
        // For local Express, Render.com, etc.
        req.pipe(bb);
    }
});


app.post('/admin/product/create-product', express.json(), async (req, res) => {
    const { name, category_slug } = req.body;
    if (!name || !category_slug) {
        return res.json({ success: false, message: "Missing name or category." });
    }
    const slug = slugify(name);
    // Check for uniqueness
    const exists = await productsModel.findOne({ slug, category_slug });
    if (exists) {
        return res.json({ success: false, message: "Product with this name already exists in this category." });
    }
    // Create new product
    const product = await productsModel.create({
        name,
        slug,
        category_slug,
        specs: {},
        images: [],
        rating_summary: {}
    });
    res.json({ success: true, product });
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

app.post('/admin/user/:id/edit', async (req, res) => {
    const bb = busboy({ headers: req.headers });
    const fields = {};
    let profilePicBuffer = null;
    let profilePicName = '';
    let profilePicMime = '';

    // Collect fields
    bb.on('field', (fieldname, val) => {
        fields[fieldname] = val;
    });

    // Collect file (profile_pic)
    bb.on('file', (fieldname, file, info) => {
        const { filename, encoding, mimeType } = info;
        if (fieldname === 'profile_pic' && filename) {
            const buffers = [];
            file.on('data', data => buffers.push(data));
            file.on('end', () => {
                profilePicBuffer = Buffer.concat(buffers);
                profilePicName = filename;
                profilePicMime = mimeType;
            });
        } else {
            file.resume();
        }
    });

    bb.on('finish', async () => {
        try {
            const user = await usersModel.findById(req.params.id);
            if (!user) {
                return res.status(404).send('User not found');
            }

            if (fields.delete) {
                await user.deleteOne();
                return res.redirect('/admin/user');
            }
            if (fields.delete_pic) {
                user.profile.profile_photo_url = '';
                await user.save();
                return res.redirect(`/admin/user/${user._id}`);
            }
            if (profilePicBuffer && Buffer.isBuffer(profilePicBuffer) && profilePicBuffer.length > 0) {
                const url = await uploadImageToGCS(profilePicBuffer, profilePicName, profilePicMime);
                user.profile.profile_photo_url = url;
            }
            user.profile.first_name = fields.first_name;
            user.profile.last_name = fields.last_name;
            user.profile.city = fields.city;
            user.profile.country = fields.country;
            user.profile.bio = fields.bio;
            if (fields.password && fields.password !== '****') {
                user.password_hash = await bcrypt.hash(fields.password, 10);
            }
            await user.save();
            res.redirect(`/admin/user/${user._id}`);
        } catch (err) {
            console.error('Admin user edit error:', err);
            res.status(500).send('Server error');
        }
    });

    // For Firebase Functions, use req.rawBody; for normal Express, use req.pipe(busboy)
    if (req.rawBody) {
        // For Firebase Functions and similar platforms
        bb.end(req.rawBody);
    } else {
        // For local Express, Render.com, etc.
        req.pipe(bb);
    }
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


