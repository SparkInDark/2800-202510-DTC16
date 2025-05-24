## About Us
Team Name: DTC-16
Team Members:
- Anderson L
- Jun Z
- Xiang X

# Rating Rebels

Rating Rebels is a web-based platform designed to provide trusted reviews and personalized recommendations for digital products, empowering users to make informed purchasing decisions in a fun, community-driven environment.

---

## Table of Contents

- Overview
- Features
- Motivation & Value
- Persona
- Tech Stack
- Getting Started
- Project Status
- Contributing
- License

---

## Overview

**Rating Rebels** enables users to rate, review, and discover digital products and services. By fostering a transparent and engaging space, the platform encourages honest feedback and interactive discovery, helping users make better decisions based on real community experiences.

---

## Features

- Browse product categories and search for products
- Rate products directly on product pages
- Upvote or downvote reviews
- Write and submit your own product reviews
- Engage with the community via comments and upvotes
- Admin dashboard to manage reviews, products, catalog, and users

---

## Motivation & Value

Rating Rebels was inspired by the need for more transparent, authentic, and community-driven product feedback. Our platform helps users:

- Discover and choose products based on real community input
- Build trust through transparent, interactive reviews
- Engage with a like-minded community
- Monetize via premium features, ads, and brand partnerships

---

## Persona

**Alex**: A 25-year-old digital native who values authentic reviews and enjoys engaging with a community of fellow product enthusiasts.

---

## Tech Stack

| Layer      | Technology                                         |
|------------|----------------------------------------------------|
| Frontend   | HTML, CSS, Tailwind CSS, JavaScript                |
| Backend    | EJS, Express, express-session, Axios, Busboy, OpenAI|
| Database   | MongoDB                                            |


## Folder Structure

```angular2html
project-root/
├── public/                                        # Frontend
│   ├── img/
│   ├── script/
│   │   └── geo.js
│   └── style/
│       └── style.css
├── src/                                           # Backend
│   ├── node_modules/
│   ├── services/
│   │   ├── imgupload.js
│   │   ├── top10product.js
│   │   └── weather.js
│   ├── views/
│   │   ├── component/
│   │   │   ├── buttom-navbar.ejs
│   │   │   ├── buttom-navbar-admin.ejs
│   │   │   ├── error-no-roduct-found.ejs
│   │   │   └── top-navbar.ejs
│   │   ├── admin-cat.ejs
│   │   ├── admin-cat-category.ejs
│   │   ├── admin-cat-spec.ejs
│   │   ├── admin-product.ejs
│   │   ├── admin-product-add.ejs
│   │   ├── admin-product-detail.ejs
│   │   ├── admin-review.ejs
│   │   ├── admin-review-detail.ejs
│   │   ├── admin-user.ejs
│   │   ├── admin-user-profile.ejs
│   │   ├── category.ejs
│   │   ├── index.ejs
│   │   ├── login.ejs
│   │   ├── product.ejs
│   │   ├── profile.ejs
│   │   ├── register.ejs
│   │   ├── search.ejs
│   │   ├── top10product.ejs
│   │   └── write_review.ejs
│   ├── .env                                       # API-Keys
│   ├── .env-key                                   # API-Keys
│   ├── .gitignore
│   ├── package.json
│   ├── package-lock.json
│   └── server.js                                  # Backend
├── .gitignore
├── about.html
└── README.md
```


---

## Getting Started

1. **Clone the repository**

```cmd
git clone https://github.com/your-username/rating-rebels.git
cd rating-rebels
```
2. **Install dependencies**

```cmd
npm install
```

3. **Set up environment variables**
- Create a `.env` file with your MongoDB URI and any necessary API keys.

4. **Run the application**
```cmd
npm start
```

5. **Access the app**
- Open your browser and go to `http://localhost:3000`

---

## Project Status

Rating Rebels is actively maintained. Core features are fully functional, and we welcome contributions and feedback.

---

## Contributing

We welcome contributions! Please fork the repository and submit a pull request. For major changes, open an issue first to discuss what you would like to change.

---

## License

This project is licensed under the MIT License.

---
