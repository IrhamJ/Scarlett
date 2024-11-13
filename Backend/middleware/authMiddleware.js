const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    console.log('Received Token:', token);
    if (token == null) {
        console.error('Token not found');
        return res.sendStatus(401);
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.error('Token verification failed:', err.message);
            console.error('Token:', token);
            return res.sendStatus(403);
        }
        req.user = user;
        next();
    });
    
};


module.exports = authenticateToken;
