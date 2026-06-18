import { Router, type IRouter } from "express";
import IntaSend from "intasend-node";

const router: IRouter = Router();

router.post("/mpesa/release", async (req, res) => {
  const { phone, amount, dealId } = req.body as {
    phone: string;
    amount: number;
    dealId: string;
  };

  if (!phone || !amount || !dealId) {
    res.status(400).json({ success: false, message: "phone, amount, and dealId are required" });
    return;
  }

  const intasend = new IntaSend(
    process.env["INTASEND_PUBLIC_KEY"] as string,
    process.env["INTASEND_SECRET_KEY"] as string,
    process.env["NODE_ENV"] !== "production",
  );

  try {
    const payouts = intasend.payouts();
    await payouts.mpesa({
      currency: "KES",
      transactions: [
        {
          name: dealId,
          account: phone,
          amount,
        },
      ],
    });

    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payment failed";
    req.log.error({ err, dealId, phone }, "M-Pesa B2C payment failed");
    res.status(502).json({ success: false, message });
  }
});

export default router;
