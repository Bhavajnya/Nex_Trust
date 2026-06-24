export const shortHash = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

export const txHash = (seed: number) =>
  "0x" + Array.from({ length: 40 }, (_, i) => (((seed + i) * 9301 + 49297) % 233280).toString(16)[0] ?? "0").join("");

export const customerJobs = [
  { id: 4821, title: "Fix leaking kitchen sink", worker: "Marcus Trent", status: "Awaiting Verification", escrow: 240, ai: "Pending", hash: txHash(11) },
  { id: 4789, title: "Repaint backyard fence", worker: "Lena Park", status: "In Progress", escrow: 380, ai: "—", hash: txHash(22) },
  { id: 4762, title: "Smart lock installation", worker: "Devon Cole", status: "Completed", escrow: 165, ai: "Verified", hash: txHash(33) },
  { id: 4755, title: "Office deep clean", worker: "Sophia Reyes", status: "Completed", escrow: 320, ai: "Verified", hash: txHash(44) },
  { id: 4711, title: "Patio tile re-grouting", worker: "Anil Verma", status: "Disputed", escrow: 540, ai: "Flagged", hash: txHash(55) },
] as const;

export const workerJobs = [
  { id: 4821, title: "Fix leaking kitchen sink", customer: "Sarah Wen", deadline: "Tomorrow, 5:00 PM", status: "Awaiting Verification", payment: 240, hash: txHash(11) },
  { id: 4790, title: "Mount 65\" TV on drywall", customer: "Jordan Liu", deadline: "Fri, Jun 27", status: "In Progress", payment: 180, hash: txHash(66) },
] as const;

export const verificationFeed = [
  { icon: "✅", text: "AI verified plumbing job #4821 — 3 photos analyzed — Passed", time: "2 min ago" },
  { icon: "📍", text: "GPS confirmed for cleanup job #3942 — within 12m of site", time: "9 min ago" },
  { icon: "🤖", text: "ML fraud check on payout #4711 — flagged for review", time: "21 min ago" },
  { icon: "💸", text: "Smart contract released $320 to Sophia Reyes (#4755)", time: "1 hr ago" },
  { icon: "🛡️", text: "Reputation score updated for Devon Cole: 92 → 94", time: "3 hr ago" },
];

export const escrowTx = [
  { title: "Fix leaking kitchen sink", amount: -240, date: "Jun 23", status: "Locked", hash: txHash(11) },
  { title: "Repaint backyard fence", amount: -380, date: "Jun 22", status: "Locked", hash: txHash(22) },
  { title: "Smart lock installation", amount: -165, date: "Jun 20", status: "Released", hash: txHash(33) },
  { title: "Wallet top-up", amount: 600, date: "Jun 18", status: "Confirmed", hash: txHash(77) },
];

export const earningsData = [
  { m: "Jan", v: 420 }, { m: "Feb", v: 610 }, { m: "Mar", v: 540 },
  { m: "Apr", v: 790 }, { m: "May", v: 920 }, { m: "Jun", v: 540 },
];

export const disputes = [
  {
    id: "DSP-2041",
    job: "Patio tile re-grouting",
    parties: "Sarah Wen ↔ Anil Verma",
    date: "Jun 22, 2026",
    status: "Under Review",
    confidence: 87,
    verdict: "Work appears complete based on 4 submitted photos. Recommended: Release payment.",
    hash: txHash(55),
  },
  {
    id: "DSP-2018",
    job: "Garage door spring replacement",
    parties: "Mateo Diaz ↔ Pravin K.",
    date: "Jun 14, 2026",
    status: "Resolved",
    confidence: 94,
    verdict: "GPS, timestamp, and photo evidence consistent. Payment released to worker.",
    hash: txHash(88),
  },
];

export const testimonials = [
  { name: "Sarah Wen", role: "Homeowner • Austin, TX", rating: 5, quote: "I funded the escrow, got AI-verified photos when the job was done, and the payment released itself. Felt magical." },
  { name: "Marcus Trent", role: "Licensed Plumber", rating: 5, quote: "No more chasing customers for payment. The smart contract pays me the moment the work passes verification." },
  { name: "Devon Cole", role: "Handyman • 4 yrs on NexTrust", rating: 5, quote: "My on-chain reputation actually means something. Every job stacks proof I can take anywhere." },
];