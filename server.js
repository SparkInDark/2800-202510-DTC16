const express = require("express");
const session = require('express-session');
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

const user_authSchema = new mongoose.Schema({
    username: String,
    password: String,
    role: { type: String, enum: ['admin', 'user'], default: 'user' }
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
    }));

    app.use(express.urlencoded({ extended: true }));
    app.use(express.static(path.join(__dirname, 'style')));
    app.use(express.static(path.join(__dirname, 'src')));

    app.set('view engine', 'ejs');

    const port = 3000;

    app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
    });

    app.get('/', (req, res) => {
        res.redirect('/home');
    });

    app.get('/home', (req, res) => {
        res.render('index.ejs', { user: req.session.user });
    });

    app.get('/login', (req, res) => {
        res.render('login.ejs', { error: null, user: req.session.user });
    });


    app.get('/register', (req, res) => {
        res.render('register.ejs', { error: null, user: req.session.user });
    });


    app.post('/register', async (req, res) => {
        const { username, password } = req.body;

        const userExists = await userAuthModel.findOne({ username });
        if (userExists) return res.status(400).send('User already exists');

        try {
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            const newUser = await userAuthModel.create({ username, password: hashedPassword });

            req.session.user = { username: newUser.username };
            res.redirect('/home');
        } catch (err) {
            console.error(err);
            res.status(500).send('Error registering user');
        }
    });

    app.post('/login', async (req, res) => {
        const { username, password } = req.body;

        const user = await userAuthModel.findOne({ username });
        if (!user) return res.status(401).send('Invalid credentials');

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return res.status(401).send('Invalid credentials');

        req.session.user = { username: user.username };
        res.redirect('/home');
    });

    app.get('/logout', (req, res) => {
        req.session.destroy(err => {
            if (err) return res.redirect('/home');
            res.clearCookie('connect.sid');
            res.redirect('/home');
        });
    });

    function isAuthenticated(req, res, next) {
        if (req.session.user) return next();
        res.redirect('/login');
    }
}
