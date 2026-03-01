const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// =========================
// MIDDLEWARE
// =========================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================
// SUPABASE CLIENT
// =========================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =========================
// HEALTH CHECK
// =========================
app.get("/health", (req, res) => {
  console.log("Health check OK");
  res.send("Server running with Supabase ✅");
});

// =========================
// SERVE pay.html AND history.html
// =========================
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "pay.html")));
app.get("/history", (req, res) => res.sendFile(path.join(__dirname, "history.html")));

// =========================
// VERIFY PAYMENT & SAVE
// =========================
app.post("/verify-payment", async (req, res) => {
  try {
    const { email, amount, contract_id, milestone, reference } = req.body;

    if (!reference) return res.status(400).json({ error: "No reference provided" });

    console.log("Checking Paystack transaction:", reference);

    // Verify transaction via Paystack history
    const paystackRes = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      }
    );

    const trx = paystackRes.data.data;

    // Only continue if transaction is completed
    if (trx.status !== "success") {
      console.log("Transaction failed or not completed:", trx.status);
      return res.status(400).json({ error: "Transaction not successful" });
    }

    // Insert or update Supabase table
    const { data, error } = await supabase.from("paystack").upsert(
      [
        {
          reference_id: trx.reference,
          email,
          amount,
          contract_id,
          milestone,
          state: trx.status,
        },
      ],
      { onConflict: ["reference_id"] }
    );

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ error: error.message });
    }

    console.log("Payment saved to Supabase ✅", data);
    res.json({ success: true, transaction: trx });
  } catch (err) {
    console.error("Server error during verification:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// =========================
// GET PAYMENT HISTORY
// =========================
app.get("/payments", async (req, res) => {
  try {
    const { data, error } = await supabase.from("paystack").select("*").order("created_at", { ascending: false });
    if (error) {
      console.error("Supabase fetch error:", error);
      return res.status(500).json({ error: error.message });
    }
    res.json(data);
  } catch (err) {
    console.error("Server error fetching payments:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// =========================
// PAYSTACK WEBHOOK (optional logging)
// =========================
app.post("/paystack-webhook", (req, res) => {
  console.log("Webhook received:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
