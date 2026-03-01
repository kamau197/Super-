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
app.use(express.static(path.join(__dirname, "client"))); // <- serve static files

/* =========================
   SUPABASE CLIENT
========================= */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* =========================
   ROUTES
========================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "client", "pay.html"));
});

/* =========================
   HEALTH CHECK
========================= */

app.get("/", (req, res) => {
  res.send("Server running with Supabase 🚀");
});

/* =========================
   VERIFY PAYMENT + SAVE
========================= */

app.post("/verify-payment", async (req, res) => {
  try {
    console.log("Incoming payment:", req.body);

    const {
      reference,
      email,
      amount,
      contract_id,
      milestone
    } = req.body;

    if (!reference) {
      return res.status(400).json({ error: "No reference provided" });
    }

    /* 🔥 VERIFY WITH PAYSTACK */
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

    /* 🔥 INSERT INTO SUPABASE TABLE 'paystack' */
    const { data, error } = await supabase
      .from("paystack")
      .insert([
        {
          reference: reference,
          email: email,
          amount: amount,
          contract_id: contract_id,
          milestone: milestone,
          state: "completed"
        }
      ]);

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ error: error.message });
    }

    console.log("Payment saved to Supabase ✅");

    res.json({ success: true });

  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
