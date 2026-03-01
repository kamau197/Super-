const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   SUPREME IDENTIFIER
========================= */
const SUPREME_ID = process.env.SUPREME_ID || "FINAL_PROJECT_001";

/* =========================
   MIDDLEWARE
========================= */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   SERVE ALL HTML FILES IN ROOT
========================= */
app.use(express.static(__dirname));

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
  res.send(`Server running with Supabase ✅ | SUPREME_ID: ${SUPREME_ID}`);
});

/* =========================
   VERIFY PAYMENT FROM FRONTEND + SAVE
========================= */
app.post("/verify-payment", async (req, res) => {
  try {
    const { reference, email, amount, contract_id, milestone, supremeId } = req.body;

    if (supremeId !== SUPREME_ID) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (!reference) {
      return res.status(400).json({ error: "No reference provided" });
    }

    console.log("Verifying payment:", reference);

    // Step 1: Verify with Paystack
    const verify = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      }
    );

    const paymentData = verify.data.data;

    if (paymentData.status !== "success") {
      return res.status(400).json({ error: "Payment not successful" });
    }

    const reference_id = paymentData.id.toString();

    // Step 2: Insert into Supabase (if not already exists)
    const { data: existing } = await supabase
      .from("paystack")
      .select("*")
      .eq("reference_id", reference_id);

    if (existing.length === 0) {
      const { data, error } = await supabase.from("paystack").insert([
        {
          reference: paymentData.reference,
          reference_id,
          email: email || paymentData.customer.email,
          amount: amount || paymentData.amount / 100,
          contract_id: contract_id || paymentData.metadata?.contract_id || null,
          milestone_id: milestone || paymentData.metadata?.milestone || null,
          currency: paymentData.currency,
          status: paymentData.status,
          raw_event: paymentData,
          created_at: paymentData.paid_at,
        },
      ]);

      if (error) {
        console.error("Supabase insert error:", error);
        return res.status(500).json({ error: error.message });
      }

      console.log("Payment saved to Supabase ✅", reference_id);
    } else {
      console.log("Payment already exists in Supabase:", reference_id);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error verifying payment:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   PULL PAYSTACK HISTORY TO SUPABASE
========================= */
app.post("/fetch-paystack-history", async (req, res) => {
  try {
    const { supremeId } = req.body;
    if (supremeId !== SUPREME_ID) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    console.log("Fetching Paystack transaction history...");

    const history = await axios.get("https://api.paystack.co/transaction", {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      params: { perPage: 50 },
    });

    const transactions = history.data.data;

    for (const trx of transactions) {
      const reference_id = trx.id.toString();
      const existing = await supabase
        .from("paystack")
        .select("*")
        .eq("reference_id", reference_id);

      if (existing.data.length === 0) {
        await supabase.from("paystack").insert([
          {
            reference: trx.reference,
            reference_id,
            email: trx.customer.email,
            amount: trx.amount / 100,
            contract_id: trx.metadata?.contract_id || null,
            milestone_id: trx.metadata?.milestone || null,
            currency: trx.currency,
            status: trx.status,
            raw_event: trx,
            created_at: trx.paid_at,
          },
        ]);
        console.log("Inserted trx:", reference_id);
      }
    }

    res.json({ success: true, count: transactions.length });
  } catch (err) {
    console.error("Error fetching Paystack history:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   GET HISTORY FOR FRONTEND
========================= */
app.get("/get-history", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("paystack")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    console.error("Error fetching history:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} | SUPREME_ID: ${SUPREME_ID}`);
});
