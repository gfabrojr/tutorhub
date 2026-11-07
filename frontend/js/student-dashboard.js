const isoDate = (d) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
function countdown(a) {
  const start = startOf(a),
    now = new Date();
  if (start <= now) return "Happening now";
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((day(start) - day(now)) / 864e5);
  if (days === 0) {
    const h = Math.max(1, Math.round((start - now) / 36e5));
    return "In " + h + (h === 1 ? " hour" : " hours");
  }
  return days === 1 ? "Tomorrow" : "In " + days + " days";
}

function ticketHTML(a) {
  const p = dateParts(a);
  return `<article class="sd-ticket">
    <div class="sd-ticket-main">
      <p class="sd-ticket-label">Next session</p>
      <h2>${esc(a.subject)}</h2>
      <p class="sd-ticket-who">with ${esc(a.tutorName)}</p>
      <p class="sd-ticket-tags"><span>${esc(a.mode)}</span><span>${a.status === "Pending" ? "Waiting for approval" : a.status}</span>${a.request ? "<span>Reschedule requested</span>" : ""}</p>
    </div>
    <div class="sd-ticket-stub">
      <p class="sd-stub-date">${p.day}</p>
      <p>${p.wd}, ${p.mon}</p>
      <p class="sd-stub-time">${fmt12(a.start)}</p>
      <p>to ${fmt12(a.end)}</p>
      <p class="sd-stub-when">${countdown(a)}</p>
    </div>
  </article>`;
}

function weekHTML(list) {
  let out = "";
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const mine = list.filter((a) => a.date === isoDate(d));
    const dots = mine
      .slice(0, 3)
      .map((a) => `<i class="${a.status.toLowerCase()}"></i>`)
      .join("");
    const label = DAYS[d.getDay()] + " " + d.getDate() + ": " + (mine.length ? mine.length + (mine.length === 1 ? " session" : " sessions") : "no sessions");
    out += `<a class="sd-day${i === 0 ? " today" : ""}" href="appointments.html" title="${label}" aria-label="${label}"><span>${DAYS[d.getDay()]}</span><b>${d.getDate()}</b><span class="sd-dots">${dots}</span></a>`;
  }
  return out;
}

function upcomingHTML(list) {
  return (
    `<ol class="sd-line">` +
    list
      .map((a) => {
        const p = dateParts(a);
        return `<li><div class="sd-date"><b>${p.day}</b>${p.mon}</div><div class="sd-what"><h3>${esc(a.subject)}</h3><p>with ${esc(a.tutorName)}</p><p>${timeRange(a)}, ${esc(a.mode)}</p>${a.request ? `<p class="sd-req">Reschedule requested: ${requestText(a.request)}</p>` : ""}</div>${badge(a.status)}</li>`;
      })
      .join("") +
    `</ol><a class="sd-more" href="appointments.html">See all appointments</a>`
  );
}

function tutorsHTML(tutors) {
  return tutors.length
    ? tutors.map((t, i) => tutorCard(t, i, `<a class="sd-book" href="tutors.html">Book</a>`)).join("")
    : `<p class="empty">No tutors yet. Check back soon.</p>`;
}

ready.then(async () => {
  guard("student");
  $("welcome").textContent = "Hi, " + me.name.split(" ")[0] + "!";
  try {
    const [all, tutors] = await Promise.all([api("/appointments"), api("/tutors")]);
    const now = new Date();
    const live = all
      .filter((a) => ["Pending", "Approved"].includes(a.status) && endOf(a) >= now)
      .sort((x, y) => startOf(x) - startOf(y));
    const fact = (cls, n, label) => `<div class="sd-fact ${cls}"><b>${n}</b><span>${label}</span></div>`;

    $("intro").textContent = live.length
      ? "Need another session? Choose a tutor and a time slot."
      : "You have no sessions booked. Choose a tutor and a time slot.";
    $("ticket").className = "sd-slot" + (live.length ? " sd-shadow" : "");
    $("ticket").innerHTML = live.length
      ? ticketHTML(live[0])
      : `<article class="sd-ticket sd-ticket-empty"><p>Your next session will show up here.</p></article>`;
    $("stats").innerHTML =
      fact("up", live.length, "Upcoming") +
      fact("wait", all.filter((a) => a.status === "Pending" && !isExpired(a)).length, "Waiting for approval") +
      fact("done", all.filter((a) => a.status === "Completed").length, "Completed");
    $("week").innerHTML = weekHTML(live);
    $("upSection").hidden = live.length < 2;
    if (live.length > 1) $("upBox").innerHTML = upcomingHTML(live.slice(1, 6));
    $("tutorsBox").innerHTML = tutorsHTML(tutors);
  } catch (err) {
    $("intro").textContent = err.message;
  }
});
