const express = require("express");
var session = require('express-session')
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcrypt');
const saltRounds = 10;

const userSchema = new mongoose.Schema({
    email: String,
    password_hash: String,
    role: String,
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

const user_authSchema = new mongoose.Schema({
    username: String,
    password: String,
    role: {
        type: String,
        enum: ['admin', 'user'],
        default: 'user'
    }
});
const userAuthModel = mongoose.model('users_auth', user_authSchema);

main().catch(err => console.log(err));
async function main() {
    const app = express();

    await mongoose.connect('mongodb+srv://learnmongodbrcmrv:BpgT7k079N7U9kgL@cluster0.zznebjg.mongodb.net');

    app.use(session({
        secret: 'keyboard cat',
        resave: true,
        saveUninitialized: true,
        cookie: { secure: false }
    }))

    app.use(express.urlencoded({ extended: true }));
    const port = 3000;

    app.use(express.static(path.join(__dirname, 'style')));
    app.use(express.static(path.join(__dirname, 'src')));
    app.set('view engine', 'ejs')

    app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
    })

    app.get('/', (req, res) => {
        res.redirect('/home');
    })

    app.get('/login', (req, res) => {
        res.render('login.ejs', { error: null });
    })

    app.get('/register', (req, res) => {
        res.render('register.ejs', { error: null });
    })

    app.get('/home', (req, res) => {
        console.log(req.session.user);
        res.render('index.ejs');
    })
    //,{ username: req.session.user.username}
    app.post('/register', async (req, res) => {
        const { username, password } = req.body;

        // Check if the user already exists in MongoDB
        const userExists = await userAuthModel.findOne({ username: username });
        if (userExists) {
            return res.status(400).send('User already exists');
        }

        try {
            // Hash the password
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Save the new user
            const newUser = await userAuthModel.create({
                username: username,
                password: hashedPassword
            });

            // Set session
            req.session.user = newUser;

            // Redirect
            res.redirect('/home');
        } catch (err) {
            console.error(err);
            res.status(500).send('Error registering user');
        }
    });

    app.get('/logout', (req, res) => {
        req.session.destroy(err => {
            if (err) {
                return res.redirect('/home');
            }
            res.clearCookie('connect.sid'); // replace with the name of your session cookie
            res.redirect('/home');
        });
    })

    app.post('/login', async (req, res) => {
        const { username, password, rememberMe } = req.body;

        // Find the user by username
        const user = await userAuthModel.findOne({ username: username });

        // Check if user exists
        if (!user) {
            return res.status(401).send('Invalid credentials');
        }

        // Compare password using bcrypt
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).send('Invalid credentials');
        }

        // Set session data
        req.session.user = user;

        // Redirect to the home page
        res.redirect('/home');
    });

    app.use(isAuthenticated);


}
//, role: req.session.user.role 
    // const isAdmin = (req, res, next) => {
    //     if (req.session && req.session.user && req.session.user.role === 'admin') {
    //         return next();
    //     } else {
    //         res.status(403).send('Forbidden');
    //     }
    // }

    // app.use(isAdmin);
