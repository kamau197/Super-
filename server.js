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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
  res.sendFile(path.join(__dirname, "pay.html"));
});

/* =========================
   VERIFY PAYMENT ENDPOINT
========================= */
app.post("/verify-payment", async (req, res) => {
  try {
    const { reference, email, amount, contract_id, milestone } = req.body;

    if (!reference) return res.status(400).json({ error: "No reference provided" });

    console.log("Verifying payment for reference:", reference);

    const verify = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      }
    );

    const paymentData = verify.data.data;
    console.log("Paystack verification result:", paymentData);

    if (paymentData.status !== "success") {
      return res.status(400).json({ error: "Payment not successful" });
    }

    const { data, error } = await supabase.from("paystack").insert([
      { reference, email, amount, contract_id, milestone, state: "completed" },
    ]);

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ error: error.message });
    }

    console.log("Payment saved to Supabase ✅", data);
    res.json({ success: true });
  } catch (err) {
    console.error("Server error during verification:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   PAYSTACK WEBHOOK (Optional logging)
========================= */
app.post("/paystack-webhook", (req, res) => {
  console.log("Webhook received:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
