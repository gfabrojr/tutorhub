const role = document.body.dataset.role;
let users = [];
const count = (l, s) => l.filter((a) => a.status === s).length;
const waiting = (l) => l.filter((a) => a.status === "Pending" && !isExpired(a)).length;
const stat = (label, n) => `<div class="stat"><b>${n}</b>${label}</div>`;
const upcoming = (l) =>
  l
    .filter((a) => ["Pending", "Approved"].includes(a.status) && endOf(a) >= new Date())
    .sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start));
const rows = (l, who) =>
  l.length
    ? `<div class="tablebox"><table><tr><th>Date</th><th>Time</th><th>With</th><th>Subject</th><th>Status</th></tr>${l.map((a) => `<tr><td>${a.date}</td><td>${timeRange(a)}</td><td>${esc(who(a))}</td><td>${esc(a.subject)}</td><td>${badge(shownStatus(a))}${a.request ? `<div class="req">Reschedule requested</div>` : ""}</td></tr>`).join("")}</table></div>`
    : `<p class="empty">Nothing here yet.</p>`;

ready.then(async () => {
  guard(role);
  $("welcome").textContent = "Welcome, " + me.name + "!";
  try {
    const all = await api("/appointments");

    if (role === "tutor") {
      $("stats").innerHTML =
        stat("Total requests", all.length) +
        stat("Pending", waiting(all)) +
        stat("Reschedule requests", all.filter((a) => a.request).length) +
        stat("Approved", count(all, "Approved")) +
        stat("Completed", count(all, "Completed"));
      $("upBox").innerHTML = rows(
        upcoming(all).filter((a) => a.status === "Approved"),
        (a) => a.studentName,
      );
    }
    if (role === "admin") {
      users = await api("/users");
      $("stats").innerHTML =
        stat("Students", users.filter((u) => u.role === "student").length) +
        stat("Tutors", users.filter((u) => u.role === "tutor").length) +
        stat("Appointments", all.length) +
        stat("Pending", waiting(all));
      $("summary").innerHTML = STATUSES_LIST()
        .map((s) => `<div class="stat">${badge(s)}<b>${count(all, s)}</b></div>`)
        .join("");
      $("upBox").innerHTML = rows(
        [...all].sort((a, b) => b.id - a.id).slice(0, 5),
        (a) => a.studentName + " / " + a.tutorName,
      );
      $("userSearch").oninput = drawUsers;
      drawUsers();
    }
  } catch (err) {
    $("stats").innerHTML = `<p class="empty">${esc(err.message)}</p>`;
  }
});
function STATUSES_LIST() {
  return ["Pending", "Approved", "Rejected", "Completed", "Cancelled"];
}
function drawUsers() {
  const q = $("userSearch").value.toLowerCase();
  const l = users.filter((u) => (u.name + " " + u.email + " " + u.role).toLowerCase().includes(q));
  $("userBox").innerHTML =
    `<div class="tablebox"><table><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr>${l.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.role}</td><td>${u.role === "admin" ? "" : `<button class="btn red sm" onclick="delUser('${u.id}')">Remove</button>`}</td></tr>`).join("")}</table></div>`;
}
async function delUser(id) {
  if (!confirm("Remove this user? Their appointments will be removed too.")) return;
  try {
    await api("/users/" + id, "DELETE");
    location.reload();
  } catch (err) {
    alert(err.message);
  }
}
