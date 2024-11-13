const connection = require('../db');

// Menambahkan pengguna baru
const createUser = (user, callback) => {
    const query = 'INSERT INTO users (username, password) VALUES (?, ?)';
    connection.query(query, [user.username, user.password], callback);
};

// Mencari pengguna berdasarkan username
const findUserByUsername = (username, callback) => {
    const query = 'SELECT * FROM users WHERE username = ?';
    connection.query(query, [username], callback);
};

module.exports = { createUser, findUserByUsername };
