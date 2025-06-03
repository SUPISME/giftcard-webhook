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
    console.error('⚠️ Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    const amountPaid = session.amount_total / 100; // Convert cents to dollars
    const userEmail = session.customer_details.email;

    try {
      const result = await databases.listDocuments(
        process.env.APPWRITE_DB_ID,
        process.env.APPWRITE_COLLECTION_ID,
        [
          Query.equal('amount', amountPaid),
          Query.equal('used', false),
          Query.limit(1),
        ]
      );

      if (result.documents.length === 0) {
        console.log('❌ No available gift cards left.');
        return res.status(404).send('No available gift cards.');
      }

      const card = result.documents[0];

      // Mark it as used
      await databases.updateDocument(
        process.env.APPWRITE_DB_ID,
        process.env.APPWRITE_COLLECTION_ID,
        card.$id,
        {
          used: true,
        }
      );

      console.log(`✅ Gift card code ${card.code} assigned to ${userEmail}`);

      // Optionally: Send email or store delivery method info here

      res.status(200).send('Gift card code assigned.');
    } catch (error) {
      console.error('❌ Error accessing Appwrite:', error);
      res.status(500).send('Internal server error');
    }
  } else {
    res.status(200).send('Event received');
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Webhook server running on port ${PORT}`));
