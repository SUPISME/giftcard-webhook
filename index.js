const express = require('express');
const Stripe = require('stripe');
const { Client, Databases, ID } = require('node-appwrite');
require('dotenv').config();

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Appwrite setup
const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);

// Stripe requires raw body for signature verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle successful checkout
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    const amountPaid = session.amount_total / 100; // Stripe uses cents
    const email = session.customer_details.email;

    // Generate a random 10-digit code
    const giftCardCode = Math.floor(1000000000 + Math.random() * 9000000000).toString();

    try {
      await databases.createDocument(
        process.env.APPWRITE_DATABASE_ID,
        process.env.APPWRITE_COLLECTION_ID,
        ID.unique(),
        {
          code: giftCardCode,
          initial_value: amountPaid,
          remaining_value: amountPaid,
          email: email,
          is_active: true,
          issued_at: new Date().toISOString(),
        }
      );

      console.log(`✅ Gift card ${giftCardCode} for $${amountPaid} created for ${email}`);
      res.status(200).send('Gift card created');
    } catch (error) {
      console.error('❌ Failed to create gift card in Appwrite:', error);
      res.status(500).send('Internal Server Error');
    }
  } else {
    res.status(200).send('Event received');
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Webhook server running on port ${PORT}`));
