const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   MIDDLEWARE
========================= */
app.use(cors());
app.use(express.json()); // parse JSON for webhook
app.use(express.urlencoded({ extended: true })); // parse urlencoded if needed

/* =========================
   SUPABASE CLIENT
========================= */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* =========================
   HEALTH CHECK
========================= */
app.get("/health", (req, res) => {
  console.log("Health check OK");
  res.send("Server running with Supabase ✅");
});

/* =========================
   SERVE pay.html
========================= */
app.get("/", (req, res) => {
  console.log("Serving pay.html");
  res.sendFile(path.join(__dirname, "pay.html"));
});

/* =========================
   PAYSTACK WEBHOOK
========================= */
app.post("/paystack-webhook", async (req, res) => {
  try {
    const event = req.body;

    console.log("Webhook received:", JSON.stringify(event, null, 2));

    if (event.event === "charge.success") {
      const trx = event.data;

      const reference = trx.reference;
      const email = trx.customer.email;
      const amount = trx.amount; // in kobo, divide by 100 if you want NGN
      const contract_id = trx.metadata?.contract_id || null;
      const milestone = trx.metadata?.milestone || null;

      console.log(
        `Processing transaction: ${reference} | Email: ${email} | Amount: ${amount} | Contract: ${contract_id} | Milestone: ${milestone}`
      );

      // Insert into Supabase
      const { data, error } = await supabase
        .from("paystack")
        .insert([
          {
            reference,
            email,
            amount,
            contract_id,
            milestone,
            state: "completed"
          }
        ]);

      if (error) {
        console.error("Supabase insert error:", error);
        return res.status(500).json({ error: error.message });
      }

      console.log("Payment saved to Supabase ✅", data);
    }

    // Respond to Paystack
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook processing error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
/* =========================
   VERIFY PAYMENT + SAVE
========================= */
app.post("/verify-payment", async (req, res) => {
  try {
    console.log("Incoming payment:", req.body);

    const { reference, email, amount, contract_id, milestone } = req.body;

    if (!reference) {
      return res.status(400).json({ error: "No reference provided" });
    }

    // 🔥 VERIFY PAYMENT WITH PAYSTACK
    const verify = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const paymentData = verify.data.data;

    if (paymentData.status !== "success") {
      return res.status(400).json({ error: "Payment not successful" });
    }

    // 🔥 INSERT INTO SUPABASE TABLE 'paystack'
    const { data, error } = await supabase
      .from("paystack")
      .insert([
        {
          reference,
          email,
          amount,
          contract_id,
          milestone,
          state: "completed"
        }
      ]);

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ error: error.message });
    }

    console.log("Payment saved to Supabase ✅");
    res.json({ success: true });

  } catch (err) {
    console.error("Server error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
