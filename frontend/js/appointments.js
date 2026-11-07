const STATUSES = ["Pending", "Approved", "Rejected", "Completed", "Cancelled"];
let appts = [],
  reschedId = null;
const findAppt = (id) => appts.find((a) => String(a.id) === String(id));

function actions(a) {
  if (me.role === "student") {
    let h = "";
    if (a.canChange)
      h += `<button class="btn sm" onclick="openResched('${a.id}')">Reschedule</button> <button class="btn red sm" onclick="act('${a.id}','Cancelled')">Cancel</button>`;
    if (a.request) h += ` <button class="btn light sm" onclick="withdrawReq('${a.id}')">Withdraw request</button>`;
    return h;
  }
  const answer = a.request
    ? `<button class="btn green sm" onclick="answerReq('${a.id}',true)">Accept new time</button> <button class="btn red sm" onclick="answerReq('${a.id}',false)">Decline</button> `
    : "";
  if (me.role === "tutor") {
    if (a.request) return answer;
    if (a.status === "Pending")
      return (
        (isExpired(a) ? "" : `<button class="btn green sm" onclick="act('${a.id}','Approved')">Approve</button> `) +
        `<button class="btn red sm" onclick="act('${a.id}','Rejected')">Reject</button>`
      );
    return a.status === "Approved" && startOf(a) <= new Date()
      ? `<button class="btn sm" onclick="act('${a.id}','Completed')">Mark completed</button>`
      : "";
  }
  return `${answer}<select onchange="act('${a.id}',this.value)">${STATUSES.map((s) => `<option ${s === a.status ? "selected" : ""}>${s}</option>`).join("")}</select>`;
}
async function act(id, status) {
  try {
    await api("/appointments/" + id, "PATCH", { status });
    showMsg("msg", "Appointment marked as " + status.toLowerCase() + ".", true);
  } catch (err) {
    showMsg("msg", err.message);
  }
  await loadAppts();
}
async function answerReq(id, accept) {
  try {
    if (accept) await api(`/appointments/${id}/reschedule/accept`, "POST", {});
    else await api(`/appointments/${id}/reschedule`, "DELETE");
    showMsg("msg", accept ? "New time accepted. The appointment was moved." : "Request declined. The original time stays.", true);
  } catch (err) {
    showMsg("msg", err.message);
  }
  await loadAppts();
}
async function withdrawReq(id) {
  try {
    await api(`/appointments/${id}/reschedule`, "DELETE");
    showMsg("msg", "Request withdrawn. Your appointment stays as it was.", true);
  } catch (err) {
    showMsg("msg", err.message);
  }
  await loadAppts();
}

function openResched(id) {
  const a = findAppt(id);
  reschedId = a.id;
  $("reschedInfo").textContent =
    `${a.subject} with ${a.tutorName}, now on ${longDate(a.date)}, ${timeRange(a)}.` +
    (a.status === "Approved" ? " Your tutor has to accept the new time. Your current time stays booked until then." : "");
  showMsg("reschedMsg", "");
  $("reschedForm").reset();
  $("rDate").min = today();
  $("rTime").innerHTML = "<option value=''>Pick a date first</option>";
  $("rNote").textContent = "";
  $("reschedDlg").showModal();
}
async function drawReschedTimes() {
  const d = $("rDate").value;
  $("rNote").textContent = "";
  if (!d) {
    $("rTime").innerHTML = "<option value=''>Pick a date first</option>";
    return;
  }
  try {
    const a = findAppt(reschedId);
    const free = await api(`/tutors/${a.tutorId}/free-times?date=${d}&exclude=${a.id}`);
    $("rTime").innerHTML = free.length ? timeOptions(free) : "<option value=''>No free times</option>";
    if (!free.length) $("rNote").textContent = "No free times on this date. The tutor may be off that day or fully booked.";
  } catch (err) {
    showMsg("reschedMsg", err.message);
  }
}

async function loadAppts() {
  appts = await api("/appointments");
  drawAppts();
}
function drawAppts() {
  const st = $("fStatus").value,
    d = $("fDate").value,
    q = $("fSearch").value.toLowerCase();
  const rows = appts
    .filter(
      (a) =>
        (!st || a.status === st) &&
        (!d || a.date === d) &&
        (a.tutorName + " " + a.studentName).toLowerCase().includes(q),
    )
    .sort((x, y) => (y.date + y.start).localeCompare(x.date + x.start));
  if (me.role === "student") {
    $("apptCards").innerHTML = studentApptsHTML(rows);
    return;
  }
  $("apptBody").innerHTML = rows.length
    ? rows
        .map(
          (a) =>
            `<tr><td>${a.date}</td><td>${timeRange(a)}</td><td>${esc(a.studentName)}</td><td>${esc(a.tutorName)}</td><td title="${esc(a.notes)}">${esc(a.subject)}</td><td>${a.mode}</td><td>${badge(shownStatus(a))}${a.request ? `<div class="req">Wants to move to ${requestText(a.request)}${a.request.reason ? ". Reason: " + esc(a.request.reason) : ""}</div>` : ""}</td><td>${actions(a)}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="8" class="empty">No appointments found.</td></tr>`;
}

function apptCard(a) {
  const p = dateParts(a);
  return `<article class="sd-appt ${shownStatus(a).toLowerCase()}"><div class="sd-date"><b>${p.day}</b>${p.mon}</div><div class="sd-what"><h3>${esc(a.subject)}</h3><p>with ${esc(a.tutorName)}</p><p>${p.wd}, ${timeRange(a)}, ${esc(a.mode)}</p>${a.request ? `<p class="sd-req">Reschedule requested: ${requestText(a.request)}</p>` : ""}${a.notes ? `<p class="sd-notes">${esc(a.notes)}</p>` : ""}</div><div class="sd-side">${badge(shownStatus(a))}${actions(a)}</div></article>`;
}
function studentApptsHTML(list) {
  if (!list.length)
    return `<p class="empty">No appointments found.</p><a class="sd-more" href="tutors.html">Book a tutor</a>`;
  const now = new Date();
  const open = list
    .filter((a) => ["Pending", "Approved"].includes(a.status) && endOf(a) >= now)
    .sort((x, y) => startOf(x) - startOf(y));
  const past = list.filter((a) => !open.includes(a)).sort((x, y) => startOf(y) - startOf(x));
  const group = (title, l) =>
    l.length ? `<h2>${title}</h2><div class="sd-appt-list">${l.map(apptCard).join("")}</div>` : "";
  return group("Upcoming", open) + group("Past and closed", past);
}

if ($("apptBody"))
  ready.then(async () => {
    guard();
    if (me.role === "student") {
      $("pageTitle").textContent = "My appointments";
      $("rule").textContent =
        "You can reschedule or cancel up to 24 hours before a session starts. If your tutor already approved it, they have to accept the new time.";
      $("fSearch").placeholder = "Search by tutor";
      $("rDate").onchange = drawReschedTimes;
      $("rCancel").onclick = () => $("reschedDlg").close();
      $("reschedForm").onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target;
        if (!f.date.value || !f.time.value) return showMsg("reschedMsg", "Choose a new date and a start time.");
        try {
          const r = await api(`/appointments/${reschedId}/reschedule`, "POST", {
            date: f.date.value,
            start: f.time.value,
            reason: f.reason.value.trim(),
          });
          $("reschedDlg").close();
          showMsg(
            "msg",
            r.requested
              ? "Request sent. Your current time stays booked until your tutor accepts the new time."
              : "Your appointment was moved to the new time.",
            true,
          );
          await loadAppts();
          window.scrollTo(0, 0);
        } catch (err) {
          showMsg("reschedMsg", err.message);
          drawReschedTimes();
        }
      };
    } else if (me.role === "tutor") {
      $("rule").textContent =
        "When a student asks to move an approved session, the new time shows under the status. Accept it to move the appointment, or decline to keep the original time.";
    }
    ["fStatus", "fDate", "fSearch"].forEach((id) => ($(id).oninput = drawAppts));
    try {
      await loadAppts();
    } catch (err) {
      showMsg("msg", err.message);
    }
  });
