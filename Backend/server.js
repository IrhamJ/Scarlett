const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require('http'); // Import http module
const socketIo = require('socket.io'); // Import socket.io
const connection = require('./db'); // Import database connection
const authenticateToken = require('./middleware/authMiddleware'); // Import auth middleware

const app = express();
const port = 3001;

// Create HTTP server and integrate with Express
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
    }
});

app.use(bodyParser.json());
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));

// Middleware for authentication
app.use('/api/monitoring', authenticateToken);

let userVisitTimes = {}; // To store visit times for users
let pageVisitLogged = {}; // To track if page visit has been logged for a session

// Endpoint to log page visit
app.post('/api/monitoring/page-visit', (req, res) => {
    const userId = req.user.id;
    const timestamp = new Date();
    const event = 'Page Visit';
    const details = { action: 'Page Visit', timestamp };

    // Check if page visit has already been logged for the user
    if (!pageVisitLogged[userId]) {
        pageVisitLogged[userId] = true;
        userVisitTimes[userId] = { visitTime: timestamp };

        console.log('Page visit:', { userId, event, details });

        const query = 'INSERT INTO activities (user_id, event_type, details) VALUES (?, ?, ?)';
        connection.query(query, [userId, event, JSON.stringify(details)], (err) => {
            if (err) {
                console.error('Error inserting page visit data:', err);
                return res.status(500).send('Internal Server Error');
            }
            res.status(200).send('Page visit recorded');
        });
    } else {
        res.status(200).send('Page visit already recorded');
    }
});

// Endpoint to log page leave
app.post('/api/monitoring/page-leave', (req, res) => {
    const userId = req.user.id;
    const timestamp = new Date();
    const event = 'Page Leave';

    // Calculate time spent on page
    const visitTime = userVisitTimes[userId]?.visitTime;
    const timeSpent = visitTime ? Math.floor((timestamp - new Date(visitTime)) / 1000) : 0; // in seconds

    // Clear the visit time for the user
    delete userVisitTimes[userId];
    delete pageVisitLogged[userId];

    const details = { action: 'Page Leave', timestamp, timeSpent };

    console.log('Page leave:', { userId, event, details });

    const query = 'INSERT INTO activities (user_id, event_type, details) VALUES (?, ?, ?)';
    connection.query(query, [userId, event, JSON.stringify(details)], (err) => {
        if (err) {
            console.error('Error inserting page leave data:', err);
            return res.status(500).send('Internal Server Error');
        }
        res.status(200).send('Page leave recorded');
    });
});

// Endpoint to receive other activity data
app.post('/api/monitoring/activity', (req, res) => {
    const { event, details } = req.body;
    const userId = req.user.id; // Get user ID from token

    // Add timestamp to details
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const updatedDetails = { ...details, timestamp };

    console.log('Received activity data:', { userId, event, updatedDetails });

    const query = 'INSERT INTO activities (user_id, event_type, details) VALUES (?, ?, ?)';
    connection.query(query, [userId, event, JSON.stringify(updatedDetails)], (err) => {
        if (err) {
            console.error('Error inserting activity data:', err);
            return res.status(500).send('Internal Server Error');
        }
        res.status(200).send('Activity data received');
    });
});

// Authentication routes
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

// WebRTC signaling server setup
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('offer', (offer) => {
        console.log('Received offer:', offer);
        socket.broadcast.emit('offer', offer);
    });

    socket.on('answer', (answer) => {
        console.log('Received answer:', answer);
        socket.broadcast.emit('answer', answer);
    });

    socket.on('ice-candidate', (candidate) => {
        console.log('Received ice-candidate:', candidate);
        socket.broadcast.emit('ice-candidate', candidate);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Start server
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
