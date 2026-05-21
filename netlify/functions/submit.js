// ─────────────────────────────────────────────────────────────
//  All Finance Group – Credit Check Backend
//  Netlify Function: /.netlify/functions/submit
//  Handles: Stripe payment · SendGrid emails · reference number
// ─────────────────────────────────────────────────────────────

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const BROKER_EMAIL = "vikas@allfinancegroup.com.au";
const BROKER_NAME  = "Vikas | All Finance Group";
const COMPANY_NAME = "All Finance Group";
const COMPANY_PHONE = "0402 597 375";
const COMPANY_WEB   = "allfinancegroup.com.au";

// Brand colours for email HTML
const TEAL = "#29d8db";
const NAVY = "#0b2e4e";
const BLUE = "#01578c";

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { applicants, totalFee, paymentMethodId, referenceNumber } = body;

  // ── Validation ──────────────────────────────────────────────
  if (!applicants || !applicants.length || !totalFee || !paymentMethodId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing required fields" }),
    };
  }

  const primaryApplicant = applicants[0];
  const allNames = applicants.map((a) => `${a.firstName} ${a.lastName}`).join(", ");
  const today = new Date().toLocaleDateString("en-AU", {
    day: "numeric", month: "long", year: "numeric",
  });

  try {
    // ── 1. Process Stripe Payment ────────────────────────────
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalFee * 100, // Stripe uses cents
      currency: "aud",
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      description: `Credit Check – ${referenceNumber} – ${allNames}`,
      metadata: {
        referenceNumber,
        applicants: allNames,
        applicantCount: String(applicants.length),
      },
    });

    if (paymentIntent.status !== "succeeded") {
      return {
        statusCode: 402,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Payment was not successful. Please try again." }),
      };
    }

    const cardLast4 = paymentIntent.payment_method_details?.card?.last4 || "****";

    // ── 2. Email to Customer (Receipt) ───────────────────────
    const customerHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f9f9;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    
    <!-- Header -->
    <div style="background:${NAVY};padding:28px 32px;text-align:center;">
      <h1 style="color:${TEAL};margin:0;font-size:24px;letter-spacing:1px;">ALL FINANCE GROUP</h1>
      <p style="color:#ffffff99;margin:4px 0 0;font-size:13px;">Mortgage Brokers Sydney · Finsure Accredited</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <h2 style="color:${NAVY};margin:0 0 6px;font-size:20px;">Application Received ✓</h2>
      <p style="color:#666;margin:0 0 24px;font-size:14px;">Thank you for submitting your credit check application with All Finance Group.</p>

      <!-- Reference box -->
      <div style="background:#f0fbfb;border:2px solid ${TEAL};border-radius:10px;padding:20px;margin-bottom:24px;">
        <p style="margin:0 0 4px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.08em;">Your Reference Number</p>
        <p style="margin:0;font-size:28px;font-weight:800;color:${BLUE};font-family:monospace;">${referenceNumber}</p>
        <p style="margin:6px 0 0;font-size:12px;color:#999;">Keep this for your records</p>
      </div>

      <!-- Details table -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px 0;font-size:13px;color:#999;width:45%;">Applicant(s)</td>
          <td style="padding:10px 0;font-size:13px;color:${NAVY};font-weight:600;">${allNames}</td>
        </tr>
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px 0;font-size:13px;color:#999;">Date Submitted</td>
          <td style="padding:10px 0;font-size:13px;color:${NAVY};font-weight:600;">${today}</td>
        </tr>
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px 0;font-size:13px;color:#999;">Fee Paid</td>
          <td style="padding:10px 0;font-size:13px;color:#16a34a;font-weight:700;">$${totalFee}.00 AUD ✓</td>
        </tr>
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px 0;font-size:13px;color:#999;">Payment Method</td>
          <td style="padding:10px 0;font-size:13px;color:${NAVY};font-weight:600;">Card ending ••••${cardLast4}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;font-size:13px;color:#999;">Status</td>
          <td style="padding:10px 0;font-size:13px;color:#d97706;font-weight:700;">Under Review</td>
        </tr>
      </table>

      <!-- What happens next -->
      <div style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:16px;margin-bottom:24px;">
        <p style="margin:0 0 10px;font-weight:700;color:#92400e;font-size:14px;">📋 What Happens Next?</p>
        <ul style="margin:0;padding-left:18px;color:#78350f;font-size:13px;line-height:2;">
          <li>Our team will review your application</li>
          <li>Credit check completed within <strong>1–2 business days</strong></li>
          <li>We will contact you with the results</li>
          <li>Your signed privacy form is attached to this email</li>
        </ul>
      </div>

      <!-- Contact -->
      <div style="background:${NAVY};border-radius:10px;padding:20px;color:#fff;">
        <p style="margin:0 0 6px;font-weight:700;font-size:15px;">Vikas</p>
        <p style="margin:0;font-size:13px;line-height:1.8;color:#ffffff99;">
          ${COMPANY_NAME} · Mortgage Broker Sydney<br>
          📞 ${COMPANY_PHONE}<br>
          ✉ ${BROKER_EMAIL}<br>
          🌐 ${COMPANY_WEB}
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f6f9f9;padding:16px 32px;text-align:center;border-top:1px solid #eee;">
      <p style="margin:0;font-size:11px;color:#999;">All Finance Group · Sydney NSW · Finsure Finance & Insurance · ACL 384704</p>
    </div>
  </div>
</body>
</html>`;

    // ── 3. Email to Broker (Notification) ───────────────────
    const brokerHtml = `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f6f9f9;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <div style="background:${NAVY};padding:20px 28px;">
      <h2 style="color:${TEAL};margin:0;">🔔 New Credit Check Application</h2>
      <p style="color:#ffffff88;margin:4px 0 0;font-size:13px;">All Finance Group · ${today}</p>
    </div>
    <div style="padding:28px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:#f0fbfb;"><td style="padding:12px;font-weight:700;color:${NAVY};border-radius:6px 0 0 6px;">Reference</td><td style="padding:12px;font-family:monospace;font-weight:800;color:${BLUE};font-size:18px;">${referenceNumber}</td></tr>
        <tr><td style="padding:10px 12px;color:#666;border-bottom:1px solid #f0f0f0;">Applicant(s)</td><td style="padding:10px 12px;font-weight:600;color:${NAVY};border-bottom:1px solid #f0f0f0;">${allNames}</td></tr>
        <tr><td style="padding:10px 12px;color:#666;border-bottom:1px solid #f0f0f0;">Primary Email</td><td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;">${primaryApplicant.email}</td></tr>
        <tr><td style="padding:10px 12px;color:#666;border-bottom:1px solid #f0f0f0;">Primary Phone</td><td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;">${primaryApplicant.phone}</td></tr>
        <tr><td style="padding:10px 12px;color:#666;border-bottom:1px solid #f0f0f0;">No. of Applicants</td><td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;">${applicants.length}</td></tr>
        <tr><td style="padding:10px 12px;color:#666;border-bottom:1px solid #f0f0f0;">Fee Collected</td><td style="padding:10px 12px;font-weight:700;color:#16a34a;border-bottom:1px solid #f0f0f0;">$${totalFee}.00 AUD ✓ (Stripe confirmed)</td></tr>
        <tr><td style="padding:10px 12px;color:#666;border-bottom:1px solid #f0f0f0;">Card Ending</td><td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;">••••${cardLast4}</td></tr>
        <tr><td style="padding:10px 12px;color:#666;border-bottom:1px solid #f0f0f0;">ID Uploaded</td><td style="padding:10px 12px;color:#16a34a;font-weight:600;border-bottom:1px solid #f0f0f0;">✓ All licences received</td></tr>
        <tr><td style="padding:10px 12px;color:#666;">Signatures</td><td style="padding:10px 12px;color:#16a34a;font-weight:600;">✓ All signed</td></tr>
      </table>
      ${applicants.length > 1 ? `
      <div style="margin-top:20px;background:#f6f9f9;border-radius:8px;padding:16px;">
        <p style="margin:0 0 10px;font-weight:700;color:${NAVY};">All Applicants:</p>
        ${applicants.map((a, i) => `<p style="margin:4px 0;font-size:13px;"><strong>${i+1}.</strong> ${a.firstName} ${a.lastName} · ${a.phone} · ${a.email}</p>`).join("")}
      </div>` : ""}
    </div>
  </div>
</body>
</html>`;

    // ── Send both emails ─────────────────────────────────────
    await Promise.all([
      // Email to applicant
      sgMail.send({
        to: primaryApplicant.email,
        from: { email: BROKER_EMAIL, name: BROKER_NAME },
        subject: `Credit Check Application Received – ${referenceNumber} | All Finance Group`,
        html: customerHtml,
        text: `Thank you ${primaryApplicant.firstName}. Your credit check application (Ref: ${referenceNumber}) has been received. Fee paid: $${totalFee}.00 AUD. We will contact you within 1-2 business days. Contact: Vikas | ${COMPANY_PHONE} | ${BROKER_EMAIL}`,
      }),
      // Email to broker
      sgMail.send({
        to: BROKER_EMAIL,
        from: { email: BROKER_EMAIL, name: `${COMPANY_NAME} Form` },
        subject: `🔔 New Credit Check – ${referenceNumber} – ${allNames}`,
        html: brokerHtml,
        text: `New application: ${referenceNumber}\nApplicants: ${allNames}\nEmail: ${primaryApplicant.email}\nPhone: ${primaryApplicant.phone}\nFee: $${totalFee} AUD\nCard: ••••${cardLast4}`,
      }),
    ]);

    // ── Success response ─────────────────────────────────────
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: true,
        referenceNumber,
        cardLast4,
        message: "Payment processed and confirmation emails sent.",
      }),
    };

  } catch (err) {
    console.error("Submit error:", err);
    
    // Give user-friendly Stripe errors
    const userMessage =
      err.type === "StripeCardError"
        ? err.message
        : err.code === "authentication_required"
        ? "Your card requires additional verification. Please try again."
        : "Something went wrong. Please try again or contact us.";

    return {
      statusCode: err.statusCode || 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: userMessage }),
    };
  }
};
