import express from 'express';
import { auth } from '../middleware/auth';
import { getTickets, createTicket, getFAQ } from '../controllers/supportController';

const router = express.Router();

// All support routes require authentication
router.use(auth);

// GET /api/support/tickets - Get all tickets for the authenticated user
router.get('/tickets', getTickets);

// POST /api/support/tickets - Create a new support ticket
router.post('/tickets', createTicket);

// GET /api/support/faq - Get FAQ data
router.get('/faq', getFAQ);

export default router;






