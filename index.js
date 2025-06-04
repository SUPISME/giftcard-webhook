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

// Allow reading raw body for Stripe signature
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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    const email = session.customer_details.email;
    const amount = session.amount_total / 100; // convert from cents
    const giftCardCode = Math.floor(1000000000 + Math.random() * 9000000000).toString();

    try {
      await databases.createDocument(
        process.env.APPWRITE_DATABASE_ID,
        process.env.APPWRITE_COLLECTION_ID,
        ID.unique(),
        {
          code: giftCardCode,
          initial_value: amount,
          remaining_value: amount,
          is_active: true,
          email: email,
          created_at: new Date().toISOString()
        }
      );

      console.log(`✅ Created gift card: ${giftCardCode} for $${amount}`);
    } catch (err) {
      console.error('Failed to create gift card in Appwrite:', err.message);
      return res.status(500).send('Failed to create gift card');
    }
  }

  res.json({ received: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Webhook listening on port ${PORT}`));
