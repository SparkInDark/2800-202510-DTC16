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
    username: String,
    password: String,
    role: {
        type: String,
        enum: ['admin', 'user'],
        default: 'user'
    }
});
const usersModel = mongoose.model('users', userSchema);

main().catch(err => console.log(err));
async function main() {
    await mongoose.connect('mongodb://127.0.0.1:27017/test');

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