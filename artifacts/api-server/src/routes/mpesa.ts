import { Router, type IRouter } from "express";
import IntaSend from "intasend-node";
import { db } from "../lib/sqlite";
import { dealsTable } from "../lib/deals-schema";

const router: IRouter = Router();

router.post("/mpesa/release", async (req, res) => {
  const { phone, amount, dealId, itemTitle, buyerPhone, sellerPhone } =
    req.body as {
      phone: string;
      amount: number;
      dealId: string;
      itemTitle?: string;
      buyerPhone?: string;
      sellerPhone?: string;
    };

  if (!phone || !amount || !dealId) {
    res
      .status(400)
      .json({ success: false, message: "phone, amount, and dealId are required" });
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

    db.insert(dealsTable).values({
      dealId,
      itemTitle: itemTitle ?? "Unknown Item",
      buyerPhone: buyerPhone ?? phone,
      sellerPhone: sellerPhone ?? phone,
      amount,
      status: "released",
      timestamp: new Date().toISOString(),
    }).run();

    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payment failed";
    req.log.error({ err, dealId, phone }, "M-Pesa B2C payment failed");

    db.insert(dealsTable).values({
      dealId,
      itemTitle: itemTitle ?? "Unknown Item",
      buyerPhone: buyerPhone ?? phone,
      sellerPhone: sellerPhone ?? phone,
      amount,
      status: "failed",
      timestamp: new Date().toISOString(),
    }).run();

    res.status(502).json({ success: false, message });
  }
});

export default router;
