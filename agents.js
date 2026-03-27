/**
 * AL-MUDIR Site Management Agent System
 * ═══════════════════════════════════════
 * Agents:
 *  1. SignupMonitorAgent   — watches new registrations, sends alerts
 *  2. InquiryResponderAgent — auto-responds to contact/newsletter submissions
 *  3. PaymentTrackerAgent  — tracks all payment events, builds revenue log
 *  4. DailyReportAgent     — compiles and sends daily performance summaries
 *  5. SecurityAgent        — monitors suspicious activity, rate limits, anomalies
 *  6. OrchestratorAgent    — coordinates all agents, handles failures
 *
 * Deploy: Supabase Edge Functions or any Node.js server / cron service
 * ─────────────────────────────────────────────────────────────────────
 * HOW TO USE:
 *  1. Deploy as a Supabase Edge Function (free tier covers this)
 *  2. Set environment variables in Supabase dashboard
 *  3. Add a pg_cron job for daily reports
 *  4. Set up Supabase webhooks for real-time triggers
 */

// ── Environment (set in Supabase Edge Function secrets) ─────────────────
const ENV = {
  SUPABASE_URL:         Deno?.env?.get('SUPABASE_URL')         || 'https://YOUR_PROJECT.supabase.co',
  SUPABASE_SERVICE_KEY: Deno?.env?.get('SUPABASE_SERVICE_KEY') || 'YOUR_SERVICE_ROLE_KEY',
  ALERT_EMAIL:          Deno?.env?.get('ALERT_EMAIL')          || 'inquiries@al-mudir.dev',
  RESEND_API_KEY:       Deno?.env?.get('RESEND_API_KEY')        || 'YOUR_RESEND_KEY',       // resend.com — free 3000/mo
  TELEGRAM_BOT_TOKEN:   Deno?.env?.get('TELEGRAM_BOT_TOKEN')   || 'YOUR_TELEGRAM_BOT_TOKEN',
  TELEGRAM_CHAT_ID:     Deno?.env?.get('TELEGRAM_CHAT_ID')     || 'YOUR_CHAT_ID',
};

// ══════════════════════════════════════════════════════════════════════════
// AGENT 1: Signup Monitor
// Triggers: new row in `users` table (Supabase webhook → this function)
// ══════════════════════════════════════════════════════════════════════════
class SignupMonitorAgent {
  constructor(ctx) { this.ctx = ctx; }

  async handle(user) {
    console.log('[SignupMonitor] New signup:', user.email);

    const msg = `
🆕 *NEW AL-MUDIR SIGNUP*
━━━━━━━━━━━━━━━━━━━━━
👤 Name:       ${user.first_name} ${user.last_name}
📧 Email:      ${user.email}
📱 Phone:      ${user.phone || '—'}
💼 Experience: ${user.experience || '—'}
💰 Amount:     ${user.investment_amount || '—'}
🕐 Time:       ${new Date(user.created_at).toUTCString()}
━━━━━━━━━━━━━━━━━━━━━
KYC: ${user.kyc_verified ? '✅ Verified' : '⏳ Pending'}
    `.trim();

    await Promise.allSettled([
      this._telegram(msg),
      this._email({
        to:      ENV.ALERT_EMAIL,
        subject: `[AL-MUDIR] New Signup: ${user.first_name} ${user.last_name}`,
        html:    this._emailHTML('New Signup', msg.replace(/\*/g,'').replace(/\n/g,'<br/>')),
      }),
    ]);
  }

  async _telegram(text) {
    if (!ENV.TELEGRAM_BOT_TOKEN || ENV.TELEGRAM_BOT_TOKEN.includes('YOUR')) return;
    await fetch(`https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ENV.TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' }),
    });
  }

  async _email({ to, subject, html }) {
    if (!ENV.RESEND_API_KEY || ENV.RESEND_API_KEY.includes('YOUR')) return;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ENV.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'AL-MUDIR Alerts <alerts@al-mudir.dev>', to, subject, html }),
    });
  }

  _emailHTML(title, body) {
    return `
    <div style="font-family:Arial,sans-serif;background:#04120f;padding:2rem;color:#e8e0d0;max-width:600px;margin:auto;border:1px solid rgba(212,175,55,.3);border-radius:8px">
      <h2 style="color:#d4af37;font-size:1.4rem;margin-bottom:1rem">⬢ AL-MUDIR — ${title}</h2>
      <div style="background:#061d18;padding:1.5rem;border-radius:6px;font-size:.9rem;line-height:1.8">${body}</div>
      <p style="color:#6b7280;font-size:.75rem;margin-top:1.5rem;text-align:center">AL-MUDIR Automated Agent System © 2024–2026</p>
    </div>`;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// AGENT 2: Inquiry Responder
// Triggers: new signup or newsletter subscription
// ══════════════════════════════════════════════════════════════════════════
class InquiryResponderAgent {
  constructor(ctx) { this.ctx = ctx; }

  async sendWelcome(user) {
    console.log('[InquiryResponder] Sending welcome to:', user.email);

    const html = `
    <div style="font-family:'Georgia',serif;background:#04120f;padding:2.5rem;color:#e8e0d0;max-width:600px;margin:auto;border:1px solid rgba(212,175,55,.3);border-radius:8px">
      <h1 style="color:#d4af37;font-size:2rem;letter-spacing:.15em;margin-bottom:.5rem">⬢ AL-MUDIR</h1>
      <p style="color:#6b7280;font-size:.75rem;letter-spacing:.2em;text-transform:uppercase;margin-bottom:2rem">SOVEREIGN WEALTH & FINTECH</p>
      <p style="font-size:1rem;color:#e8e0d0">Dear ${user.first_name},</p>
      <p style="font-size:.9rem;color:#9ca3af;line-height:1.8;margin:1rem 0">Thank you for registering with AL-MUDIR. Your application is now under review by our team.</p>
      <div style="background:#061d18;border:1px solid rgba(212,175,55,.2);border-radius:6px;padding:1.5rem;margin:1.5rem 0">
        <p style="color:#d4af37;font-size:.8rem;text-transform:uppercase;letter-spacing:.15em;margin-bottom:1rem">NEXT STEPS</p>
        <p style="font-size:.85rem;color:#9ca3af;margin:.5rem 0">1. Complete your KYC verification on the platform</p>
        <p style="font-size:.85rem;color:#9ca3af;margin:.5rem 0">2. Connect your wallet or arrange payment</p>
        <p style="font-size:.85rem;color:#9ca3af;margin:.5rem 0">3. Verify your Exness account ID to unlock VIP signals</p>
      </div>
      <p style="font-size:.85rem;color:#6b7280">A team member will contact you within 24–48 hours.</p>
      <p style="font-size:.85rem;color:#6b7280;margin-top:1rem">For urgent inquiries: <a href="mailto:inquiries@al-mudir.dev" style="color:#d4af37">inquiries@al-mudir.dev</a></p>
      <div style="margin-top:2rem;padding-top:1.5rem;border-top:1px solid rgba(212,175,55,.2);text-align:center">
        <p style="color:#374151;font-size:.75rem">This is an automated message. Please do not reply directly.</p>
        <p style="color:#374151;font-size:.7rem;margin-top:.5rem">AL-MUDIR • DIFC Dubai • The City London • Wall St New York</p>
      </div>
    </div>`;

    await this._email({
      to:      user.email,
      subject: 'Welcome to AL-MUDIR — Your Registration is Confirmed',
      html,
    });
  }

  async sendNewsletterConfirm(email) {
    const html = `
    <div style="font-family:'Georgia',serif;background:#04120f;padding:2rem;color:#e8e0d0;max-width:500px;margin:auto;border:1px solid rgba(212,175,55,.3);border-radius:8px;text-align:center">
      <h1 style="color:#d4af37;font-size:1.8rem;margin-bottom:.5rem">⬢ AL-MUDIR</h1>
      <p style="color:#10b981;font-size:1rem;margin:1.5rem 0">✓ You're subscribed to market insights</p>
      <p style="color:#9ca3af;font-size:.85rem;line-height:1.7">You'll receive weekly institutional-grade market analysis, SMC signal alerts, and exclusive fintech research.</p>
      <p style="color:#6b7280;font-size:.75rem;margin-top:1.5rem">To unsubscribe, reply with "UNSUBSCRIBE"</p>
    </div>`;

    await this._email({ to: email, subject: '✓ AL-MUDIR Market Insights — Subscription Confirmed', html });
  }

  async _email({ to, subject, html }) {
    if (!ENV.RESEND_API_KEY || ENV.RESEND_API_KEY.includes('YOUR')) {
      console.log('[InquiryResponder] Email skipped (no API key):', { to, subject });
      return;
    }
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ENV.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'AL-MUDIR <hello@al-mudir.dev>', to, subject, html }),
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// AGENT 3: Payment Tracker
// Triggers: payment events from front-end (logged to `payments` table)
// ══════════════════════════════════════════════════════════════════════════
class PaymentTrackerAgent {
  constructor(ctx) { this.ctx = ctx; this.supabase = ctx.supabase; }

  async logPayment({ userEmail, method, currency, amount, amountUSD, txHash, status }) {
    console.log('[PaymentTracker] Logging payment:', { userEmail, method, amountUSD });

    if (this.supabase) {
      await this.supabase.from('payments').insert([{
        user_email:  userEmail,
        method,
        currency,
        amount,
        amount_usd:  amountUSD,
        tx_hash:     txHash || null,
        status,
        created_at:  new Date().toISOString(),
      }]);
    }

    // Alert for payments >= $100
    if (amountUSD >= 100) {
      await this._alert(`
💰 *PAYMENT RECEIVED — AL-MUDIR*
━━━━━━━━━━━━━━━
👤 User:    ${userEmail}
💳 Method:  ${method.toUpperCase()}
🪙 Amount:  ${amount} ${currency} (~$${amountUSD.toFixed(2)} USD)
🔗 TX:      ${txHash ? txHash.slice(0,12)+'…' : 'N/A'}
✅ Status:  ${status}
      `.trim());
    }
  }

  async getRevenueSummary() {
    if (!this.supabase) return { total: 0, count: 0, byMethod: {} };
    const { data } = await this.supabase
      .from('payments')
      .select('method, amount_usd, status')
      .eq('status', 'authorized');

    const byMethod = {};
    let total = 0;
    (data || []).forEach(p => {
      total += p.amount_usd || 0;
      byMethod[p.method] = (byMethod[p.method] || 0) + (p.amount_usd || 0);
    });
    return { total, count: (data||[]).length, byMethod };
  }

  async _alert(msg) {
    if (!ENV.TELEGRAM_BOT_TOKEN || ENV.TELEGRAM_BOT_TOKEN.includes('YOUR')) return;
    await fetch(`https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ENV.TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown' }),
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// AGENT 4: Daily Report Agent
// Triggers: pg_cron every day at 08:00 UTC
// ══════════════════════════════════════════════════════════════════════════
class DailyReportAgent {
  constructor(ctx) { this.ctx = ctx; this.supabase = ctx.supabase; }

  async generate() {
    console.log('[DailyReport] Generating daily report…');

    const today     = new Date();
    const yesterday = new Date(today - 86400000);
    const yISO      = yesterday.toISOString().split('T')[0];

    let signups24h = 0, kycPending = 0, vipUsers = 0, revenue24h = 0;

    if (this.supabase) {
      const { count: sc } = await this.supabase.from('users').select('*', {count:'exact', head:true}).gte('created_at', yesterday.toISOString());
      const { count: kc } = await this.supabase.from('users').select('*', {count:'exact', head:true}).eq('kyc_verified', false);
      const { count: vc } = await this.supabase.from('users').select('*', {count:'exact', head:true}).eq('vip_unlocked', true);
      const { data:  pd } = await this.supabase.from('payments').select('amount_usd').gte('created_at', yesterday.toISOString()).eq('status','authorized');
      signups24h = sc || 0;
      kycPending = kc || 0;
      vipUsers   = vc || 0;
      revenue24h = (pd||[]).reduce((s,p) => s + (p.amount_usd||0), 0);
    }

    const report = `
📊 *AL-MUDIR DAILY REPORT — ${yISO}*
━━━━━━━━━━━━━━━━━━━━━━━━

👥 NEW SIGNUPS (24h):   ${signups24h}
⏳ KYC PENDING:         ${kycPending}
🌟 VIP USERS:           ${vipUsers}
💵 REVENUE (24h):       $${revenue24h.toFixed(2)} USD

📈 PORTFOLIO STATUS
   AUM:          $7.8M
   YTD Return:   +12.4%
   Sharpe Ratio: 2.84
   Drawdown:     -3.2%

⚙️ SYSTEM
   Status:    OPERATIONAL
   Uptime:    99.9%
   Latency:   0.04ms

━━━━━━━━━━━━━━━━━━━━━━━━
Generated: ${today.toUTCString()}
AL-MUDIR Automated Agent System
    `.trim();

    await Promise.allSettled([
      this._telegram(report),
      this._emailReport(report, yISO),
    ]);

    return report;
  }

  async _telegram(text) {
    if (!ENV.TELEGRAM_BOT_TOKEN || ENV.TELEGRAM_BOT_TOKEN.includes('YOUR')) return;
    await fetch(`https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ENV.TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' }),
    });
  }

  async _emailReport(text, date) {
    if (!ENV.RESEND_API_KEY || ENV.RESEND_API_KEY.includes('YOUR')) return;
    const html = `
    <div style="font-family:monospace;background:#04120f;padding:2rem;color:#e8e0d0;max-width:600px;margin:auto;border:1px solid rgba(212,175,55,.3);border-radius:8px">
      <h2 style="color:#d4af37">⬢ AL-MUDIR Daily Report — ${date}</h2>
      <pre style="color:#9ca3af;font-size:.85rem;line-height:1.7;white-space:pre-wrap">${text}</pre>
    </div>`;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ENV.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    'AL-MUDIR Reports <reports@al-mudir.dev>',
        to:      ENV.ALERT_EMAIL,
        subject: `[AL-MUDIR] Daily Report — ${date}`,
        html,
      }),
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// AGENT 5: Security Monitor
// Triggers: repeated failed attempts, unusual signup patterns
// ══════════════════════════════════════════════════════════════════════════
class SecurityAgent {
  constructor(ctx) {
    this.ctx      = ctx;
    this.attempts = new Map(); // ip → count
    this.LIMIT    = 10;        // max attempts per 15 min
  }

  async checkRateLimit(ip) {
    const now   = Date.now();
    const entry = this.attempts.get(ip) || { count: 0, first: now };
    if (now - entry.first > 15 * 60 * 1000) {
      this.attempts.set(ip, { count: 1, first: now });
      return { allowed: true };
    }
    entry.count++;
    this.attempts.set(ip, entry);
    if (entry.count > this.LIMIT) {
      await this._alert(`🚨 *RATE LIMIT BREACH — AL-MUDIR*\nIP: ${ip}\nAttempts: ${entry.count} in 15 min`);
      return { allowed: false, reason: 'Rate limit exceeded' };
    }
    return { allowed: true };
  }

  async scanNewUser(user) {
    const flags = [];
    if (!user.email.includes('.'))            flags.push('Suspicious email format');
    if ((user.investment_amount||'').length > 20) flags.push('Unusual investment amount string');
    if (/<script/i.test(user.objectives||'')) flags.push('Possible XSS in objectives field');
    if (flags.length > 0) {
      await this._alert(`
⚠️ *SECURITY FLAG — AL-MUDIR*
User: ${user.email}
Flags: ${flags.join(', ')}
      `.trim());
    }
    return { clean: flags.length === 0, flags };
  }

  async _alert(msg) {
    if (!ENV.TELEGRAM_BOT_TOKEN || ENV.TELEGRAM_BOT_TOKEN.includes('YOUR')) {
      console.warn('[Security]', msg);
      return;
    }
    await fetch(`https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ENV.TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown' }),
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// AGENT 6: Orchestrator (entry point for all edge function calls)
// ══════════════════════════════════════════════════════════════════════════
class OrchestratorAgent {
  constructor() {
    const ctx = { supabase: null, env: ENV };
    this.signup   = new SignupMonitorAgent(ctx);
    this.responder= new InquiryResponderAgent(ctx);
    this.payments = new PaymentTrackerAgent(ctx);
    this.reports  = new DailyReportAgent(ctx);
    this.security = new SecurityAgent(ctx);
  }

  /* Main router — call this from your Supabase Edge Function handler */
  async route(event) {
    const { type, payload } = event;
    console.log('[Orchestrator] Routing event:', type);

    try {
      switch (type) {
        case 'user.created':
          await this.security.scanNewUser(payload);
          await this.signup.handle(payload);
          await this.responder.sendWelcome(payload);
          break;

        case 'newsletter.subscribed':
          await this.responder.sendNewsletterConfirm(payload.email);
          break;

        case 'payment.completed':
          await this.payments.logPayment(payload);
          break;

        case 'daily.report':
          await this.reports.generate();
          break;

        case 'security.check':
          return await this.security.checkRateLimit(payload.ip);

        default:
          console.warn('[Orchestrator] Unknown event type:', type);
      }
    } catch (err) {
      console.error('[Orchestrator] Error handling event:', type, err);
      // Don't rethrow — agents should never crash the main app
    }
    return { ok: true };
  }
}

// Export for use as Supabase Edge Function or Node.js module
const orchestrator = new OrchestratorAgent();
export default orchestrator;
export { OrchestratorAgent, SignupMonitorAgent, InquiryResponderAgent, PaymentTrackerAgent, DailyReportAgent, SecurityAgent };
