// 1. Load environment variables FIRST
require('dotenv').config();

// 2. Then require other modules
const express = require("express");
const session = require('express-session')
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcrypt');
const multer = require("multer");
const axios = require('axios');
const upload = multer({ storage: multer.memoryStorage() }); // Store file in memory

// 3. Define constants
const port = 3000;
const saltRounds = 10;

// 4. Define schema
const userSchema = new mongoose.Schema({
    email: String,
    password_hash: String,
    role: {
        type: String,
        enum: ['admin', 'user'],
        default: 'user'
    },
    profile: {
        first_name: String,
        last_name: String,
        city: String,
        country: String,
        bio: String,
        profile_photo_url: String
    },
    created_at: Date
});

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
    },
    created_at: Date
});

const reviewsModel = mongoose.model('reviews', reviewSchema);


const ratingSchema = new mongoose.Schema({
    product_name: String,
    user_email: String,
    rating: Number,
    rated_at: Date
});

const ratingsModel = mongoose.model('ratings', ratingSchema);


const productSchema = new mongoose.Schema({
    name: String,
    category_slug: String,
    specs: {
        brand: String,
        storage: String,
        ram: String,
        screen_size: String,
        processor: String // present for some products (e.g., laptops)
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
    },
    created_at: Date
});

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

// 5. Define main
main().catch(err => console.log(err));
async function main() {
    // main-1. setup constants
    const app = express();
    await mongoose.connect('mongodb+srv://learnmongodbrcmrv:BpgT7k079N7U9kgL@cluster0.zznebjg.mongodb.net');

    // main-2. config app setting
    app.set('view engine', 'ejs')

    // main-3. middleware (app.use)
    app.use(express.urlencoded({ extended: true }));
    const port = 3000;
    app.use(session({
        secret: 'keyboard cat',
        resave: true,
        saveUninitialized: true,
        cookie: { secure: false }
    }))
    app.use(express.static(path.join(__dirname, 'style')));
    app.use(express.static(path.join(__dirname, 'src')));

    // main-4. locals
    app.use((req, res, next) => {
        res.locals.user = req.session.user || null;
        next();
    });

    // main-5. routes organized by feature with pairs of (app.get, app.post)

    // home routes
    app.get('/', (req, res) => {
        res.redirect('/home');
    })

    app.get('/home', (req, res) => {
        console.log(req.session.user);
        res.render('index.ejs');
    })

    // register routes
    app.get('/register', (req, res) => {
        res.render('register.ejs');
    })

    // use { email: req.session.user.email}, but not username
    app.post('/register', async (req, res) => {
        const { email, password } = req.body;

        // Check if the email already exists in MongoDB
        const userExists = await usersModel.findOne({ email: email });
        if (userExists) {
            return res.status(400).send('Email already exists');
        }

        try {
            // Hash the password
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

    // login routes
    app.get('/login', (req, res) => {
        res.render('login.ejs');
    })

    app.post('/login', async (req, res) => {
        const { email, password } = req.body;

        // Find the user by username
        const user = await userModel.findOne({ email: email });

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

    // logout routes
    app.get('/logout', (req, res) => {
        req.session.destroy(err => {
            if (err) {
                return res.redirect('/home');
            }
            res.clearCookie('connect.sid'); // replace with the name of your session cookie
            res.redirect('/home');
        });
    })

    // profile routes
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

    // category routes
    app.get('/category', (req, res) => {
        res.render('category.ejs');
    })

    // product routes
    app.get('/product', (req, res) => {
        res.render('product.ejs');
    })

    app.get('/product/:productName', (req, res) => {
        const productName = req.params.productName;
        res.render('productdetail.ejs', { productName });
    })

    // write-review routes
    app.get('/write-review', (req, res) => {
        res.render('write_review.ejs');
    })

    // app.listen at the bottom of the main function
    app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
    })

//, role: req.session.user.role 
    // const isAdmin = (req, res, next) => {
    //     if (req.session && req.session.user && req.session.user.role === 'admin') {
    //         return next();
    //     } else {
    //         res.status(403).send('Forbidden');
    //     }
    // }

    // app.use(isAdmin);
}

