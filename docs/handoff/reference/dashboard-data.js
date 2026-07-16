/* BrightLoop client dashboard — demo data. */
window.BL_DASH = {
  project: {
    client: "Meridian Studio", plan: "Transform", phase: "Build", progress: 42,
    started: "Jul 2, 2026", target: "Aug 20, 2026", pm: "Alex Chen",
  },
  milestones: [
    { id: 1, label: "01", title: "Kickoff & discovery", status: "done", date: "Jul 2–5", body: "Questionnaire, access & brand audit complete." },
    { id: 2, label: "02", title: "Website design", status: "done", date: "Jul 6–18", body: "Design system + key pages approved." },
    { id: 3, label: "03", title: "Website build", status: "active", date: "Jul 19–Aug 2", body: "Front-end build in progress — 60% complete." },
    { id: 4, label: "04", title: "CRM & automation", status: "upcoming", date: "Aug 3–14", body: "Pipeline, follow-up sequences, integrations." },
    { id: 5, label: "05", title: "Launch & handover", status: "upcoming", date: "Aug 15–20", body: "QA, training, go-live." },
  ],
  tasks: [
    { phase: "Website build", title: "Homepage front-end", owner: "BrightLoop", status: "in-progress" },
    { phase: "Website build", title: "Services page", owner: "BrightLoop", status: "in-progress" },
    { phase: "Website build", title: "Provide team headshots", owner: "You", status: "todo" },
    { phase: "Website build", title: "Approve homepage design", owner: "You", status: "done" },
    { phase: "CRM & automation", title: "Map current sales process", owner: "You", status: "todo" },
    { phase: "CRM & automation", title: "Configure pipeline stages", owner: "BrightLoop", status: "upcoming" },
  ],
  deliverables: [
    { id: 1, title: "Brand guidelines v2", type: "PDF", status: "approved", version: "v2", date: "Jul 17" },
    { id: 2, title: "Homepage design", type: "Figma", status: "approved", version: "v3", date: "Jul 15" },
    { id: 3, title: "Services page design", type: "Figma", status: "review", version: "v1", date: "Jul 22" },
    { id: 4, title: "Website staging build", type: "Link", status: "in-progress", version: "—", date: "—" },
  ],
  files: [
    { name: "Brand-Guidelines-v2.pdf", size: "4.2 MB", by: "BrightLoop", date: "Jul 17", kind: "file-text" },
    { name: "Logo-Suite.zip", size: "18 MB", by: "BrightLoop", date: "Jul 12", kind: "archive" },
    { name: "Company-photos.zip", size: "62 MB", by: "You", date: "Jul 8", kind: "image" },
    { name: "Content-copy.docx", size: "240 KB", by: "You", date: "Jul 6", kind: "file-text" },
  ],
  messages: [
    { from: "Alex Chen", role: "BrightLoop PM", you: false, time: "9:14 AM", text: "Morning! The homepage build is on staging — take a look when you can and drop any notes here." },
    { from: "You", role: "", you: true, time: "9:31 AM", text: "Looks great. One thing — can the hero CTA say ‘Book a consult’ instead?" },
    { from: "Alex Chen", role: "BrightLoop PM", you: false, time: "9:38 AM", text: "Done — pushed live to staging. Anything else and we'll roll it into today's build." },
  ],
  questionnaires: [
    { id: 1, title: "Kickoff questionnaire", status: "done", q: 12 },
    { id: 2, title: "Brand & tone", status: "done", q: 8 },
    { id: 3, title: "CRM & sales process", status: "todo", q: 10 },
  ],
  invoices: [
    { id: "INV-1042", desc: "Project deposit (40%)", amount: "$4,120", status: "paid", date: "Jul 2" },
    { id: "INV-1051", desc: "Milestone 2 — design", amount: "$3,090", status: "paid", date: "Jul 18" },
    { id: "INV-1063", desc: "Milestone 3 — build", amount: "$3,090", status: "due", date: "Aug 2" },
  ],
  activity: [
    { icon: "check-circle", text: "You approved Homepage design v3", time: "2h ago" },
    { icon: "upload", text: "Alex uploaded Brand Guidelines v2", time: "Yesterday" },
    { icon: "message-square", text: "New message from Alex Chen", time: "Yesterday" },
    { icon: "credit-card", text: "Invoice INV-1051 paid", time: "3 days ago" },
  ],
};
