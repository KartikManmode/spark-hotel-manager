import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role client for DB operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { bookingIds, recipientGstin, companyName, paymentMode } = await req.json();

    if (!bookingIds?.length) {
      return new Response(JSON.stringify({ error: "No bookings selected" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call the atomic DB function
    const { data: invoiceData, error: dbError } = await supabase.rpc("finalize_checkout", {
      p_booking_ids: bookingIds,
      p_recipient_gstin: recipientGstin || null,
      p_company_name: companyName || null,
      p_payment_mode: paymentMode || "cash",
    });

    if (dbError) {
      return new Response(JSON.stringify({ error: dbError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate PDF HTML
    const pdfHtml = generateInvoiceHtml(invoiceData);

    // Store PDF as HTML (lightweight approach)
    const fileName = `${invoiceData.invoice_number}.html`;
    const { error: uploadError } = await supabase.storage
      .from("invoices")
      .upload(fileName, new TextEncoder().encode(pdfHtml), {
        contentType: "text/html",
        upsert: false,
      });

    let pdfUrl = "";
    if (!uploadError) {
      const { data: urlData } = supabase.storage.from("invoices").getPublicUrl(fileName);
      pdfUrl = urlData.publicUrl;

      // Update invoice with PDF URL
      await supabase
        .from("invoices")
        .update({ pdf_url: pdfUrl })
        .eq("id", invoiceData.invoice_id);
    }

    // Send email via Resend
    let emailSent = false;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey && invoiceData.guest_email) {
      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "HotelOS <onboarding@resend.dev>",
            to: [invoiceData.guest_email],
            subject: `Invoice ${invoiceData.invoice_number} - HotelOS`,
            html: pdfHtml,
          }),
        });
        if (emailRes.ok) {
          emailSent = true;
          await supabase
            .from("invoices")
            .update({ email_sent: true })
            .eq("id", invoiceData.invoice_id);
        }
        await emailRes.text(); // consume body
      } catch {
        // Email failure does not rollback invoice
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        invoice: {
          ...invoiceData,
          pdf_url: pdfUrl,
          email_sent: emailSent,
        },
        html: pdfHtml,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function generateInvoiceHtml(inv: any): string {
  const items = (inv.items || []) as any[];
  const itemRows = items
    .map(
      (item: any, i: number) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${i + 1}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${item.room_number}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${item.description}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">₹${Number(item.amount).toFixed(2)}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Invoice ${inv.invoice_number}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 40px; color: #1a1a2e; background: #fff; }
  .invoice-box { max-width: 800px; margin: auto; border: 1px solid #ddd; padding: 40px; }
  .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
  .hotel-name { font-size: 28px; font-weight: 700; color: #1a1a2e; }
  .invoice-title { font-size: 20px; color: #666; margin-top: 4px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
  .info-block label { font-size: 11px; text-transform: uppercase; color: #999; letter-spacing: 0.5px; }
  .info-block p { margin: 2px 0 0; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #f8f8fc; padding: 10px 8px; text-align: left; font-size: 12px; text-transform: uppercase; color: #666; border-bottom: 2px solid #ddd; }
  th:last-child { text-align: right; }
  .totals { text-align: right; margin-top: 10px; }
  .totals .row { display: flex; justify-content: flex-end; gap: 40px; padding: 4px 0; font-size: 14px; }
  .totals .row.total { font-size: 18px; font-weight: 700; border-top: 2px solid #1a1a2e; padding-top: 8px; margin-top: 4px; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center; }
  @media print { body { padding: 0; } .invoice-box { border: none; } }
</style>
</head>
<body>
<div class="invoice-box">
  <div class="header">
    <div>
      <div class="hotel-name">HotelOS</div>
      <div class="invoice-title">Tax Invoice</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:18px;font-weight:600;">${inv.invoice_number}</div>
      <div style="font-size:13px;color:#666;">${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-block">
      <label>Bill To</label>
      <p style="font-weight:600;">${inv.guest_name}</p>
      ${inv.recipient_company_name ? `<p>${inv.recipient_company_name}</p>` : ""}
      ${inv.recipient_gstin ? `<p>GSTIN: ${inv.recipient_gstin}</p>` : ""}
    </div>
    <div class="info-block" style="text-align:right;">
      <label>Hotel GSTIN</label>
      <p>27AFSFS6576C1ZD</p>
      <label style="margin-top:8px;display:block;">Payment Mode</label>
      <p style="text-transform:capitalize;">${(inv.payment_mode || "cash").replace("_", " ")}</p>
    </div>
  </div>

  <table>
    <thead><tr><th>#</th><th>Room</th><th>Description</th><th style="text-align:right;">Amount</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Base Amount:</span><span>₹${Number(inv.base_amount).toFixed(2)}</span></div>
    <div class="row"><span>CGST (2.5%):</span><span>₹${Number(inv.cgst_amount).toFixed(2)}</span></div>
    <div class="row"><span>SGST (2.5%):</span><span>₹${Number(inv.sgst_amount).toFixed(2)}</span></div>
    <div class="row total"><span>Total:</span><span>₹${Number(inv.total_amount).toFixed(2)}</span></div>
  </div>

  <div class="footer">
    This is a computer-generated invoice. No signature required.<br>
    GSTIN: 27AFSFS6576C1ZD
  </div>
</div>
</body>
</html>`;
}
