const express = require("express");
var session = require('express-session')
const mongoose = require('mongoose');

/*example schema and model
const userSchema = new mongoose.Schema({
    username: String,
    password: String,
    role: {
        type: String,
        enum: ['admin', 'user'],
        default: 'user'
    }
});
const usersModel = mongoose.model('users', userSchema);
*/

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



main().catch(err => console.log(err));
async function main() {
    await mongoose.connect('mongodb+srv://learnmongodbrcmrv:BpgT7k079N7U9kgL@cluster0.zznebjg.mongodb.net');

    const app = express();

    app.use(session({
        secret: 'keyboard cat',
        resave: true,
        saveUninitialized: true,
        cookie: { secure: false }
    }))
    app.use(express.urlencoded({ extended: true }));
    const port = 3000;

    app.set('view engine', 'ejs')

    app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
    })
    app.get('/', (req, res) => {
        res.redirect('/home');
    })

    app.get('/login', (req, res) => {
        res.sendFile(__dirname + '/login.html');
    })

    app.post('/login', async (req, res) => {
        const { username, password } = req.body;
        const user = await usersModel.findOne({ username: username, password: password });

        if (user) {
            req.session.user = user;
            res.redirect('/home');
        } else {
            res.status(401).send('Invalid credentials');
        }
    })

    const isAuthenticated = (req, res, next) => {
        if (req.session && req.session.user) {
            return next();
        } else {
            res.redirect('/login');
        }
    }
    app.use(isAuthenticated);

    app.get('/home', (req, res) => {
        console.log(req.session.user);
        res.render('index.ejs', { username: req.session.user.username, role: req.session.user.role });
    })

    const isAdmin = (req, res, next) => {
        if (req.session && req.session.user && req.session.user.role === 'admin') {
            return next();
        } else {
            res.status(403).send('Forbidden');
        }
    }

    app.use(isAdmin);
}