import { Router, type IRouter } from "express";
import IntaSend from "intasend-node";
import { db } from "../lib/sqlite";
import { dealsTable } from "../lib/deals-schema";

const router: IRouter = Router();

const DEFAULT_CALLBACK = process.env["STK_CALLBACK_URL"] ?? "https://escrow-api-production-f7c3.up.railway.app/api/mpesa/callback";

// STK Push: initiate M-Pesa STK Push to a buyer's phone
router.post("/mpesa/stkpush", async (req, res) => {
  const { phone, amount, email, narrative, callbackUrl } = req.body as {
    phone: string;
    amount: number;
    email?: string;
    narrative?: string;
    callbackUrl?: string;
  };

  if (!phone || !amount) {
    res.status(400).json({ success: false, message: "phone and amount are required" });
    return;
  }

  const intasend = new IntaSend(
    process.env["INTASEND_PUBLIC_KEY"] as string,
    process.env["INTASEND_SECRET_KEY"] as string,
    process.env["NODE_ENV"] !== "production",
  );

  try {
    const client: any = (intasend as any).mpayment ? (intasend as any).mpayment() : (intasend as any).mpesa ? (intasend as any).mpesa() : intasend;

    const payload: any = {
      phone_number: phone,
      amount,
      email: email ?? undefined,
      narrative: narrative ?? "Payment",
      callback_url: callbackUrl ?? DEFAULT_CALLBACK,
    };

    let result: any;
    if (typeof client.mpesaStkPush === "function") {
      result = await client.mpesaStkPush(payload);
    } else if (typeof (intasend as any).mpesaStkPush === "function") {
      result = await (intasend as any).mpesaStkPush(payload);
    } else {
      res.status(500).json({ success: false, message: "STK push method not available in SDK" });
      return;
    }

    // Optionally record a pending deal row if dealId provided in query/body
    if (req.body.dealId) {
      try {
        db.insert(dealsTable).values({
          dealId: req.body.dealId,
          itemTitle: req.body.itemTitle ?? "Unknown Item",
          buyerPhone: phone,
          sellerPhone: phone,
          amount,
          status: "pending",
          timestamp: new Date().toISOString(),
        }).run();
      } catch (e) {
        // non-fatal
        req.log?.warn?.({ err: e }, "Failed to insert pending deal");
      }
    }

    res.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "STK push failed";
    req.log?.error?.({ err, phone }, "M-Pesa STK push failed");
    res.status(502).json({ success: false, message });
  }
});

// Query STK push / transaction status
router.post("/mpesa/query", async (req, res) => {
  const { checkoutRequestId, transactionId } = req.body as { checkoutRequestId?: string; transactionId?: string };

  if (!checkoutRequestId && !transactionId) {
    res.status(400).json({ success: false, message: "checkoutRequestId or transactionId is required" });
    return;
  }

  const intasend = new IntaSend(
    process.env["INTASEND_PUBLIC_KEY"] as string,
    process.env["INTASEND_SECRET_KEY"] as string,
    process.env["NODE_ENV"] !== "production",
  );

  try {
    const client: any = (intasend as any).mpayment ? (intasend as any).mpayment() : (intasend as any).mpesa ? (intasend as any).mpesa() : intasend;

    let result: any;
    if (checkoutRequestId && typeof client.queryMpesa === "function") {
      result = await client.queryMpesa({ checkoutRequestId });
    } else if (checkoutRequestId && typeof (intasend as any).queryMpesa === "function") {
      result = await (intasend as any).queryMpesa({ checkoutRequestId });
    } else if (transactionId && typeof client.getTransaction === "function") {
      result = await client.getTransaction({ transactionId });
    } else {
      res.status(500).json({ success: false, message: "Query method not available in SDK" });
      return;
    }

    res.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    req.log?.error?.({ err, checkoutRequestId, transactionId }, "M-Pesa query failed");
    res.status(502).json({ success: false, message });
  }
});

// Callback endpoint for IntaSend / M-Pesa to post status updates
router.post("/mpesa/callback", async (req, res) => {
  // IntaSend will POST webhook data here. Just accept and persist minimal info.
  const body = req.body;
  try {
    // Log the callback for debugging
    req.log?.info?.({ body }, "Received STK callback");

    // Attempt to update deal status if we can find a dealId or related identifier
    // Common fields: checkoutRequestId, transactionId, metadata, reference
    const checkoutRequestId = body?.checkoutRequestId ?? body?.CheckoutRequestID ?? body?.Body?.stkCallback?.CheckoutRequestID;
    const resultCode = body?.Body?.stkCallback?.ResultCode ?? body?.resultCode ?? body?.result_code;
    const resultDesc = body?.Body?.stkCallback?.ResultDesc ?? body?.resultDesc ?? body?.result_description;

    // If metadata contains a dealId, update that deal's status
    const metadata = body?.Body?.stkCallback?.CallbackMetadata ?? body?.metadata ?? body?.CallbackMetadata;
    let dealId: string | undefined;
    if (metadata && Array.isArray(metadata?.Item)) {
      for (const item of metadata.Item) {
        if (item?.Name?.toLowerCase?.()?.includes("reference") || item?.Name?.toLowerCase?.()?.includes("deal")) {
          dealId = item?.Value;
          break;
        }
      }
    }

    if (!dealId && body?.reference) dealId = body.reference;

    if (dealId) {
      try {
        const status = resultCode === 0 ? "released" : "failed";
        db.update(dealsTable).set({ status }).where(dealsTable.dealId.equals(dealId)).run();
      } catch (e) {
        req.log?.warn?.({ err: e }, "Failed to update deal from callback");
      }
    }

    // Respond 200 to acknowledge webhook
    res.status(200).json({ success: true });
  } catch (err) {
    req.log?.error?.({ err }, "Error handling STK callback");
    // Still respond 200 to avoid retries if the provider expects it; adjust if you prefer 500 for debugging
    res.status(200).json({ success: false, message: "error processing callback" });
  }
});

// Existing release route (kept as-is)
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
