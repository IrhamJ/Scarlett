const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createUser, findUserByUsername } = require('../models/userModel');

const register = (req, res) => {
    const { username, password } = req.body;
    findUserByUsername(username, (err, result) => {
        if (err) {
            console.error('Error finding user by username:', err);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
        if (result.length > 0) {
            return res.status(400).json({ message: 'Username already exists' });
        }
        const hashedPassword = bcrypt.hashSync(password, 10);
        createUser({ username, password: hashedPassword }, (err) => {
            if (err) {
                console.error('Error creating user:', err);
                return res.status(500).json({ message: 'Internal Server Error' });
            }
            res.status(201).json({ message: 'User registered successfully' });
        });
    });
};

const login = (req, res) => {
    const { username, password } = req.body;
    findUserByUsername(username, (err, result) => {
        if (err) {
            console.error('Error finding user by username:', err);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
        if (result.length === 0) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }
        const user = result[0];
        if (bcrypt.compareSync(password, user.password)) {
            const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
            res.json({ token });
        } else {
            res.status(400).json({ message: 'Invalid username or password' });
        }
    });
};
module.exports = { register, login };
