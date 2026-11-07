const LINKS = {
  student: [
    ["student-dashboard.html", "Dashboard"],
    ["tutors.html", "Tutors"],
    ["appointments.html", "My appointments"],
    ["profile.html", "Profile"],
  ],
  tutor: [
    ["tutor-dashboard.html", "Dashboard"],
    ["appointments.html", "Appointments"],
    ["profile.html", "Profile"],
  ],
  admin: [
    ["admin-dashboard.html", "Dashboard"],
    ["tutors.html", "Tutors"],
    ["appointments.html", "Appointments"],
  ],
};
function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
const badge = (s) => `<span class="badge ${s.toLowerCase()}">${s}</span>`;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COLORS = ["blue", "pink", "mint", "yellow"];
const SHAPES = ["round", "square", "leaf", "drop"];
const startOf = (a) => new Date(a.date + "T" + a.start);
const endOf = (a) => new Date(a.date + "T" + a.end);
const dateParts = (a) => {
  const d = startOf(a);
  return { wd: DAYS[d.getDay()], day: d.getDate(), mon: MONTHS[d.getMonth()] };
};
const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad2 = (n) => String(n).padStart(2, "0");
const toMinutes = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const fmt12 = (t) => ((+t.slice(0, 2)) % 12 || 12) + ":" + t.slice(3, 5) + " " + (+t.slice(0, 2) < 12 ? "AM" : "PM");
const addHour = (t) => pad2(Math.floor((toMinutes(t) + 60) / 60)) + ":" + t.slice(3, 5);
const timeRange = (a) => fmt12(a.start) + " - " + fmt12(a.end);
const longDate = (d) => {
  const x = new Date(d + "T00:00");
  return DAYS[x.getDay()] + ", " + MONTHS[x.getMonth()] + " " + x.getDate();
};
const requestText = (r) => longDate(r.date) + ", " + fmt12(r.start) + " - " + fmt12(r.end);
const isExpired = (a) => a.status === "Pending" && endOf(a) < new Date();
const shownStatus = (a) => (isExpired(a) ? "Expired" : a.status);
function timeOptions(list) {
  const groups = [
    ["Morning", (m) => m < 720],
    ["Afternoon", (m) => m >= 720 && m < 1020],
    ["Evening", (m) => m >= 1020],
  ];
  return groups
    .map(([label, inGroup]) => {
      const items = list.filter((t) => inGroup(toMinutes(t)));
      return items.length
        ? `<optgroup label="${label}">${items.map((t) => `<option value="${t}">${fmt12(t)} - ${fmt12(addHour(t))}</option>`).join("")}</optgroup>`
        : "";
    })
    .join("");
}
function halfHourOptions(blankLabel) {
  let out = blankLabel ? `<option value="">${blankLabel}</option>` : "";
  for (let m = 300; m <= 1380; m += 30) {
    const t = pad2(Math.floor(m / 60)) + ":" + pad2(m % 60);
    out += `<option value="${t}">${fmt12(t)}</option>`;
  }
  return out;
}
function daysText(days) {
  if (!days.length) return "No days set";
  if (days.length === 7) return "Every day";
  const idx = days.map((d) => WEEK.indexOf(d)).sort((a, b) => a - b);
  const run = idx.length > 2 && idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  return run ? WEEK[idx[0]] + " to " + WEEK[idx[idx.length - 1]] : idx.map((i) => WEEK[i]).join(", ");
}
const scheduleText = (t) =>
  t.workStart
    ? daysText(t.days) + ", " + fmt12(t.workStart) + " - " + fmt12(t.workEnd) + (t.breakStart ? ". Break " + fmt12(t.breakStart) + " - " + fmt12(t.breakEnd) : "")
    : "";
function tutorCard(t, i, action) {
  return `<article class="sd-tutor"><div class="sd-av ${COLORS[i % 4]} ${SHAPES[i % 4]}">${esc(initials(t.name))}</div><h3>${esc(t.name)}</h3><p class="sd-bio">${esc(t.bio)}</p><p class="sd-subj">${t.subjects.map((s) => `<span>${esc(s)}</span>`).join("")}</p><p class="sd-rate"><b>₱${t.rate}</b> per hour</p><p class="sd-hours">${esc(scheduleText(t))}</p>${action}</article>`;
}
function renderNav() {
  const u = me,
    page = location.pathname.split("/").pop();
  const links = u
    ? LINKS[u.role]
        .map((l) => `<a href="${l[0]}" class="${l[0] === page ? "active" : ""}">${l[1]}</a>`)
        .join("") + `<a href="#" onclick="logout()">Log out (${esc(u.name)})</a>`
    : `<a href="login.html">Log in</a><a href="register.html">Register</a>`;
  $("nav").innerHTML =
    `<a class="brand" href="index.html">TutorHub</a><button id="menuBtn" aria-label="Menu">☰</button><div class="links" id="links">${links}</div>`;
  $("menuBtn").onclick = () => $("links").classList.toggle("open");
}
ready.then(renderNav);
