const express = require('express');
const Stripe = require('stripe');
const { Client, Databases, Query } = require('node-appwrite');
require('dotenv').config();

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Appwrite client setup
const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);

// Needed to read raw body for Stripe signature verification
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
    console.error('❌ Stripe signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ✅ Handle successful payment
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const amountPaid = session.amount_total / 100;

    try {
      // Find unused gift card with matching amount
      const result = await databases.listDocuments(
        process.env.APPWRITE_DATABASE_ID,
        process.env.APPWRITE_COLLECTION_ID,
        [
          Query.equal('amount', amountPaid),
          Query.equal('used', false),
          Query.limit(1)
        ]
      );

      if (result.total === 0) {
        console.warn('⚠️ No available gift card for this amount');
        return res.status(200).send('No available gift card');
      }

      const card = result.documents[0];

      // Mark it as used
      await databases.updateDocument(
        process.env.APPWRITE_DATABASE_ID,
        process.env.APPWRITE_COLLECTION_ID,
        card.$id,
        { used: true }
      );

      console.log(`✅ Gift card assigned: ${card.code}`);

      // Optionally, you can email the user here (later step)

      res.status(200).send('Gift card assigned');
    } catch (error) {
      console.error('❌ Failed to process gift card:', error);
      res.status(500).send('Server error');
    }
  } else {
    res.status(200).send('Event received');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Webhook server running on port ${PORT}`);
});
