"use client";

import { useAuth } from "@/contexts/auth";
import { backendApi } from "@/lib/api";
import { CreateWeeklyOrderResponse } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const ensureRazorpayScript = async () =>
  new Promise<void>((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay SDK failed to load"));
    document.body.appendChild(script);
  });

export default function PaywallPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [router, user]);

  const launchCheckout = async (order: CreateWeeklyOrderResponse) => {
    if (!order.keyId) throw new Error("Razorpay key missing");
    await ensureRazorpayScript();

    await new Promise<void>((resolve, reject) => {
      if (!window.Razorpay) {
        reject(new Error("Razorpay SDK unavailable"));
        return;
      }

      const checkout = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: "Antar",
        description: "Antar Weekly Access",
        prefill: {
          name: user?.displayName || "Antar User",
          email: user?.email || ""
        },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            const verify = await backendApi.verifyWeeklyPayment({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature
            });
            setSuccess(`Payment verified. Weekly access unlocked till ${verify.currentPeriodEnd}.`);
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        modal: {
          ondismiss: () => reject(new Error("Payment cancelled"))
        }
      });

      checkout.open();
    });
  };

  return (
    <main className="screen" style={{ gap: "1rem" }}>
      <button className="btn btn-secondary" onClick={() => router.back()}>Back</button>
      <h1 style={{ marginBottom: 0 }}>Your subscription</h1>
      <p className="note">No hidden fees, change or cancel anytime.</p>

      <section className="panel" style={{ padding: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Antar Premium</h2>
        <p className="note">Rs 100/week, billed weekly</p>
        <button
          className="btn btn-primary"
          style={{ width: "100%" }}
          disabled={loading}
          onClick={async () => {
            try {
              setError(null);
              setSuccess(null);
              setLoading(true);
              const order = await backendApi.createWeeklyOrder();
              await launchCheckout(order);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? "Opening checkout..." : "Subscribe for Rs 100/week"}
        </button>
        {success && <p>{success}</p>}
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
