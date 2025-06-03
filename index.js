const express = require('express');
const Stripe = require('stripe');
const { Client, Databases, Query } = require('node-appwrite');
require('dotenv').config();

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Appwrite client setup
const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);

// Webhook endpoint
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
    console.log('Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const amount = session.amount_total / 100; // convert cents to dollars

    try {
      const result = await databases.listDocuments(
        process.env.APPWRITE_DATABASE_ID,
        'giftcards',
        [
          Query.equal('amount', amount),
          Query.equal('used', false),
          Query.limit(1),
        ]
      );

      if (result.total === 0) {
        console.log('No unused gift cards found.');
        return res.status(404).send('No gift cards available.');
      }

      const card = result.documents[0];

      // Mark it as used
      await databases.updateDocument(
        process.env.APPWRITE_DATABASE_ID,
        'giftcards',
        card.$id,
        { used: true }
      );

      console.log('Gift card assigned:', card.code);

      // TODO: trigger email or print option

    } catch (error) {
      console.error('Error with Appwrite:', error);
      return res.status(500).send('Database error.');
    }
  }

  res.status(200).send('Received');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
