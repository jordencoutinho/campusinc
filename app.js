// CampusSync part 2: login, timetable, attendance. Uses `db`, `$`, `makeElement`, `showBanner` from script.js.
const app = { user: null, profile: null, tab: "notices", liveSession: null };
const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TABS = ["notices", "timetable", "attendance"];
const isTeacher = () => app.profile && app.profile.role === "teacher";

function showTab(name) {
  app.tab = name;
  TABS.forEach((t) => { $("tab-" + t).hidden = t !== name; $("nav-" + t).classList.toggle("active", t === name); });
  $("new-button").hidden = name !== "notices";
  if (name === "timetable") loadTimetable();
  if (name === "attendance") loadAttendance();
}

// ---------- Login ----------
async function refreshUser() {
  const { data } = await db.auth.getSession();
  app.user = data.session ? data.session.user : null;
  app.profile = null;
  if (app.user) app.profile = (await db.from("profiles").select("*").eq("id", app.user.id).single()).data;
  $("account-button").textContent = app.user ? `${app.profile ? app.profile.name : app.user.email} · Sign out` : "Sign in";
  showTab(app.tab);
}

async function authenticate(signUp) {
  if (!db) return;
  const email = $("auth-email").value.trim(), password = $("auth-password").value;
  const name = $("auth-name").value.trim();
  const res = signUp ? await db.auth.signUp({ email, password, options: { data: { name } } }) : await db.auth.signInWithPassword({ email, password });
  if (res.error) { $("auth-error").textContent = res.error.message; $("auth-error").hidden = false; return; }
  $("auth-dialog").close();
  await refreshUser();
}

function needLogin(box) {
  box.innerHTML = "";
  box.appendChild(makeElement("p", "muted", "Sign in to see this."));
}

// ---------- Timetable ----------
async function loadTimetable() {
  const box = $("timetable-box");
  if (!app.user) return needLogin(box);
  const { data, error } = await db.from("slots").select("*").order("start_time");
  if (error) return showBanner("Couldn't load the timetable.");
  box.innerHTML = "";
  for (let d = 1; d <= 6; d++) {
    const day = makeElement("div", "day-card");
    day.appendChild(makeElement("h3", "", DAYS[d]));
    const rows = data.filter((s) => s.day === d);
    if (!rows.length) day.appendChild(makeElement("p", "muted", "No classes"));
    rows.forEach((s) => {
      const row = makeElement("div", "slot");
      row.appendChild(makeElement("span", "slot-time", s.start_time));
      row.appendChild(makeElement("span", "slot-subject", s.subject));
      row.appendChild(makeElement("span", "muted", s.room));
      if (isTeacher()) {
        const del = makeElement("button", "button small danger", "×");
        del.onclick = async () => { await db.from("slots").delete().eq("id", s.id); loadTimetable(); };
        row.appendChild(del);
      }
      day.appendChild(row);
    });
    box.appendChild(day);
  }
  $("slot-form").hidden = !isTeacher();
}

async function addSlot() {
  const slot = { subject: $("slot-subject").value.trim(), day: +$("slot-day").value, start_time: $("slot-time").value, room: $("slot-room").value.trim() };
  if (!slot.subject || !slot.start_time) return showBanner("Enter a subject and a start time.");
  const { error } = await db.from("slots").insert(slot);
  if (error) return showBanner(error.message);
  $("slot-subject").value = "";
  loadTimetable();
}

// ---------- Attendance ----------
async function loadAttendance() {
  const box = $("attendance-box");
  if (!app.user) return needLogin(box);
  box.innerHTML = "";
  if (isTeacher()) return loadTeacherAttendance(box);

  // Student: enter the code, then see percentages
  const entry = makeElement("div", "panel");
  entry.appendChild(makeElement("h3", "", "Mark attendance"));
  const input = makeElement("input"); input.placeholder = "6-digit code from your teacher"; input.inputMode = "numeric"; input.maxLength = 6;
  const btn = makeElement("button", "button primary", "Mark present");
  const msg = makeElement("p", "muted");
  btn.onclick = async () => {
    const { data, error } = await db.rpc("mark_attendance", { p_code: input.value.trim() });
    msg.textContent = error ? error.message : `Marked present for ${data}.`;
    if (!error) loadAttendance();
  };
  entry.append(input, btn, msg);
  box.appendChild(entry);

  const { data } = await db.rpc("my_attendance");
  if (!data || !data.length) return box.appendChild(makeElement("p", "muted", "No classes recorded yet."));
  data.forEach((r) => {
    const total = Number(r.total), att = Number(r.attended), pct = total ? (att / total) * 100 : 100;
    const skip = Math.floor(att / 0.75 - total), need = Math.max(0, 3 * total - 4 * att);
    const card = makeElement("div", "stat" + (pct < 75 ? " low" : pct < 80 ? " warn" : ""));
    card.appendChild(makeElement("h3", "", r.subject));
    card.appendChild(makeElement("div", "stat-pct", pct.toFixed(0) + "%"));
    card.appendChild(makeElement("p", "muted", `${att} of ${total} classes`));
    card.appendChild(makeElement("p", "", pct < 75 ? `Below 75%. Attend the next ${need} classes in a row to recover.` : `You can skip ${skip} more ${skip === 1 ? "class" : "classes"} and stay above 75%.`));
    box.appendChild(card);
  });
}

async function loadTeacherAttendance(box) {
  const { data } = await db.from("slots").select("subject");
  const subjects = [...new Set((data || []).map((s) => s.subject))];
  const panel = makeElement("div", "panel");
  panel.appendChild(makeElement("h3", "", "Start an attendance session"));
  const select = makeElement("select"); select.innerHTML = subjects.map((s) => `<option>${s}</option>`).join("");
  const btn = makeElement("button", "button primary", "Generate code (valid 10 min)");
  const out = makeElement("div");
  btn.onclick = async () => {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const row = { subject: select.value, code, expires_at: new Date(Date.now() + 600000).toISOString() };
    const res = await db.from("sessions").insert(row).select().single();
    if (res.error) return showBanner(res.error.message);
    out.innerHTML = "";
    out.appendChild(makeElement("div", "code", code));
    const count = makeElement("p", "muted", "0 students present");
    const refresh = makeElement("button", "button small", "Refresh count");
    refresh.onclick = async () => {
      const c = await db.from("marks").select("id", { count: "exact", head: true }).eq("session_id", res.data.id);
      count.textContent = `${c.count} students present`;
    };
    out.append(count, refresh);
  };
  panel.append(select, btn, out);
  box.appendChild(subjects.length ? panel : makeElement("p", "muted", "Add subjects in the Timetable tab first."));
}

// ---------- Start ----------
// Buttons are wired up even if the database is not connected, so they always respond.
TABS.forEach((t) => ($("nav-" + t).onclick = () => showTab(t)));
$("account-button").onclick = async () => {
  if (!db) return showBanner("Not connected to Supabase. Check the URL and key in config.js.");
  if (app.user) { await db.auth.signOut(); refreshUser(); } else $("auth-dialog").showModal();
};
$("auth-signin").onclick = () => authenticate(false);
$("auth-signup").onclick = () => authenticate(true);
$("auth-close").onclick = () => $("auth-dialog").close();
$("slot-add").onclick = addSlot;
if (db) refreshUser();