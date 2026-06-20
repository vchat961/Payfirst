import { Router, type IRouter } from "express";
import IntaSend from "intasend-node";
import { eq } from "drizzle-orm";
import { db } from "../lib/sqlite";
import { dealsTable } from "../lib/deals-schema";

const router: IRouter = Router();

router.post("/mpesa/stkpush", async (req, res) => {
  const { phone, amount, dealId } = req.body as {
    phone: string;
    amount: number;
    dealId: string;
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
    const collection = intasend.collection();
    const response = await collection.charge({
      first_name: dealId,
      last_name: "",
      email: "",
      host: process.env["API_HOST"] ?? "https://api.escrow.co.ke",
      amount,
      phone_number: phone,
      currency: "KES",
      api_ref: dealId,
    });

    req.log.info({ dealId, phone, amount }, "M-Pesa STK push initiated");
    res.json({
      success: true,
      invoice_id: response.invoice?.invoice_id ?? null,
      state: response.invoice?.state ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "STK push failed";
    req.log.error({ err, dealId, phone }, "M-Pesa STK push failed");
    res.status(502).json({ success: false, message });
  }
});

router.post("/mpesa/query", async (req, res) => {
  const { transactionRef, dealId } = req.body as {
    transactionRef?: string;
    dealId?: string;
  };

  if (!transactionRef && !dealId) {
    res
      .status(400)
      .json({ success: false, message: "transactionRef or dealId is required" });
    return;
  }

  // If only dealId is provided, look up the most recent deal record for context
  const ref = transactionRef ?? dealId;

  const intasend = new IntaSend(
    process.env["INTASEND_PUBLIC_KEY"] as string,
    process.env["INTASEND_SECRET_KEY"] as string,
    process.env["NODE_ENV"] !== "production",
  );

  try {
    const collection = intasend.collection();
    const response = await collection.status(ref as string);

    req.log.info({ ref, dealId }, "M-Pesa payment status queried");

    // Sync status back to the local deals table when a dealId is known
    if (dealId && response.invoice?.state) {
      const invoiceState: string = response.invoice.state;
      const statusMap: Record<string, string> = {
        COMPLETE: "released",
        FAILED: "failed",
        PENDING: "pending",
        PROCESSING: "pending",
      };
      const mappedStatus = statusMap[invoiceState.toUpperCase()] ?? "pending";

      db.update(dealsTable)
        .set({ status: mappedStatus })
        .where(eq(dealsTable.dealId, dealId))
        .run();
    }

    res.json({
      success: true,
      invoice_id: response.invoice?.invoice_id ?? ref,
      state: response.invoice?.state ?? null,
      value: response.invoice?.value ?? null,
      currency: response.invoice?.currency ?? null,
      account: response.invoice?.account ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status query failed";
    req.log.error({ err, ref, dealId }, "M-Pesa payment status query failed");
    res.status(502).json({ success: false, message });
  }
});

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
