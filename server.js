require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ===============================
   PAYSTACK WEBHOOK
================================= */
app.post('/webhook', async (req, res) => {

  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    return res.status(401).send('Invalid signature');
  }

  const event = req.body;

  if (event.event === "charge.success") {

    const data = event.data;

    await supabase.from('paystack').insert({
      reference: data.reference,
      contract_id: data.metadata?.contract_id,
      milestone_id: data.metadata?.milestone_id,
      email: data.customer.email,
      amount: data.amount / 100,
      currency: data.currency,
      status: data.status,
      raw_event: event
    });

  }

  res.sendStatus(200);
});

/* ===============================
   GET PAYMENT HISTORY
================================= */
app.get('/payments', async (req, res) => {

  const { data } = await supabase
    .from('paystack')
    .select('*')
    .order('created_at', { ascending: false });

  res.json(data);
});

app.listen(process.env.PORT || 3000, () =>
  console.log("Server running")
);