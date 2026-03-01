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
   SERVE history.html
========================= */
app.get("/history", (req, res) => {
  console.log("Serving history.html");
  res.sendFile(path.join(__dirname, "history.html"));
});

/* =========================
   FETCH PAYSTACK HISTORY
========================= */
app.get("/fetch-paystack", async (req, res) => {
  try {
    console.log("Fetching Paystack transaction history...");

    // 1️⃣ Get transactions from Paystack
    const response = await axios.get("https://api.paystack.co/transaction", {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
    });

    const transactions = response.data.data; // array of transactions
    console.log(`Fetched ${transactions.length} transactions`);

    // 2️⃣ Insert each transaction into Supabase
    for (const trx of transactions) {
      const { reference, customer, amount, currency, status, metadata, id: paystack_id } = trx;

      const { data, error } = await supabase
        .from("paystack")
        .upsert([{
          reference,
          reference_id: paystack_id,
          email: customer?.email || null,
          amount,
          currency,
          status,
          contract_id: metadata?.contract_id || null,
          milestone_id: metadata?.milestone || null,
          raw_event: trx
        }], { onConflict: ["reference_id"] }); // avoid duplicates

      if (error) console.error("Supabase insert error:", error);
      else console.log("Inserted transaction:", reference);
    }

    res.json({ success: true, count: transactions.length });
  } catch (err) {
    console.error("Error fetching Paystack history:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   GET ALL PAYMENTS (for history.html)
========================= */
app.get("/payments", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("paystack")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase fetch error:", error);
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    console.error("Server error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
