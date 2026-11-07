const split = (v) =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
let allTutors = [],
  picked = null,
  editId = null;

async function loadTutors() {
  allTutors = await api("/tutors");
  drawTutors();
}
function drawTutors() {
  const q = $("search").value.toLowerCase();
  const list = allTutors.filter((t) =>
    (t.name + " " + t.subjects.join(" ") + " " + t.bio).toLowerCase().includes(q),
  );
  $("tutorList").innerHTML = list.length
    ? list
        .map((t) =>
          me.role === "student"
            ? tutorCard(t, allTutors.indexOf(t), `<button class="sd-book" onclick="openBook('${t.id}')">Book</button>`)
            : `<div class="card"><h3>${esc(t.name)}</h3><p>${esc(t.bio)}</p><p>${t.subjects.map((s) => `<span class="tag">${esc(s)}</span>`).join("")}</p><p><b>₱${t.rate}/hr</b></p><p>${esc(scheduleText(t))}</p>` +
              (me.role === "admin"
                ? `<button class="btn light sm" onclick="editTutor('${t.id}')">Edit</button> <button class="btn red sm" onclick="delTutor('${t.id}')">Remove</button>`
                : "") +
              `</div>`,
        )
        .join("")
    : `<p class="empty">No tutors match your search.</p>`;
}
function openBook(id) {
  picked = allTutors.find((t) => t.id === +id);
  $("bookTitle").textContent = "Book " + picked.name + " (₱" + picked.rate + "/hr)";
  $("schedInfo").textContent = scheduleText(picked);
  $("subject").innerHTML = picked.subjects.map((s) => `<option>${esc(s)}</option>`).join("");
  $("date").min = today();
  $("bookForm").hidden = false;
  drawTimes();
  $("bookForm").scrollIntoView();
}
async function drawTimes() {
  const d = $("date").value;
  $("timeNote").textContent = "";
  if (!d) {
    $("time").innerHTML = "<option value=''>Pick a date first</option>";
    return;
  }
  try {
    const free = await api(`/tutors/${picked.id}/free-times?date=${d}`);
    if (free.length) {
      $("time").innerHTML = timeOptions(free);
      return;
    }
    $("time").innerHTML = "<option value=''>No free times</option>";
    const day = new Date(d + "T00:00").getDay();
    $("timeNote").textContent = !picked.days.includes(DAYS[day])
      ? picked.name + " is not available on " + FULL_DAYS[day] + "s."
      : d === today()
        ? "No more free times today. Try another date."
        : "No free times on this date. Try another date.";
  } catch (err) {
    showMsg("msg", err.message);
  }
}
function editTutor(id) {
  const t = allTutors.find((x) => x.id === +id),
    f = $("tutorForm");
  editId = t.id;
  f.tname.value = t.name;
  f.email.value = t.email;
  f.subjects.value = t.subjects.join(", ");
  f.rate.value = t.rate;
  f.password.value = "";
  f.password.disabled = true;
  f.password.placeholder = "Not changed when editing";
  f.scrollIntoView();
}
async function delTutor(id) {
  if (!confirm("Remove this tutor? Their appointments will be removed too.")) return;
  try {
    await api("/users/" + id, "DELETE");
    showMsg("msg", "Tutor removed.", true);
    await loadTutors();
  } catch (err) {
    showMsg("msg", err.message);
  }
}

if ($("tutorList"))
  ready.then(async () => {
    guard();
    if (me.role === "student") {
      $("pageTitle").textContent = "Find a tutor";
      $("pageSub").textContent = "Pick a tutor, then choose a date and any start time that is free.";
      $("pageSub").hidden = false;
      $("tutorList").className = "sd-tutors";
      $("search").placeholder = "Search by name or subject";
    }
    $("search").oninput = drawTutors;
    $("date").onchange = drawTimes;
    if (me.role === "admin") $("tutorForm").hidden = false;
    $("bookForm").onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await api("/appointments", "POST", {
          tutorId: picked.id,
          subject: f.subject.value,
          date: f.date.value,
          start: f.time.value,
          mode: f.mode.value,
          notes: f.notes.value.trim(),
        });
        showMsg("msg", "Appointment requested. The tutor will approve or reject it soon.", true);
        f.reset();
        f.hidden = true;
      } catch (err) {
        showMsg("msg", err.message);
        drawTimes();
      }
      window.scrollTo(0, 0);
    };
    $("tutorForm").onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target,
        email = f.email.value.trim().toLowerCase();
      if (!f.tname.value.trim() || !email || !f.subjects.value.trim() || !f.rate.value || (!editId && !f.password.value))
        return showMsg("msg", "Please fill in all tutor fields.");
      if (!validEmail(email)) return showMsg("msg", "Enter a valid email address.");
      if (!editId && f.password.value.length < 6) return showMsg("msg", "Password must be at least 6 characters.");
      const data = {
        name: f.tname.value.trim(),
        email,
        subjects: split(f.subjects.value),
        rate: +f.rate.value,
      };
      if (!editId) data.password = f.password.value;
      try {
        if (editId) await api("/tutors/" + editId, "PUT", data);
        else await api("/tutors", "POST", data);
        editId = null;
        f.reset();
        f.password.disabled = false;
        f.password.placeholder = "";
        showMsg("msg", "Tutor saved.", true);
        await loadTutors();
      } catch (err) {
        showMsg("msg", err.message);
      }
    };
    try {
      await loadTutors();
    } catch (err) {
      showMsg("msg", err.message);
    }
  });

if ($("profileForm"))
  ready.then(() => {
    guard();
    const f = $("profileForm");
    if (me.role === "student") {
      $("profileHead").hidden = false;
      $("pAvatar").textContent = initials(me.name);
      $("pName").textContent = me.name;
    }
    f.pname.value = me.name;
    f.pemail.value = me.email;
    if (me.role === "tutor") {
      $("tutorFields").hidden = false;
      f.pstart.innerHTML = f.pend.innerHTML = halfHourOptions();
      f.pbreakstart.innerHTML = halfHourOptions("No break");
      f.pbreakend.innerHTML = halfHourOptions("No break");
      const fillSchedule = () => {
        f.psubjects.value = me.subjects.join(", ");
        f.prate.value = me.rate;
        f.pstart.value = me.workStart || "09:00";
        f.pend.value = me.workEnd || "17:00";
        f.pbreakstart.value = me.breakStart || "";
        f.pbreakend.value = me.breakEnd || "";
        document.querySelectorAll("#pdays input").forEach((c) => (c.checked = me.days.includes(c.value)));
      };
      fillSchedule();
    }
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (!f.pname.value.trim()) return showMsg("msg", "Name is required.");
      if (f.ppass.value && f.ppass.value.length < 6)
        return showMsg("msg", "Password must be at least 6 characters.");
      const data = { name: f.pname.value.trim(), password: f.ppass.value };
      if (me.role === "tutor") {
        data.subjects = split(f.psubjects.value);
        data.rate = +f.prate.value || 0;
        data.workStart = f.pstart.value;
        data.workEnd = f.pend.value;
        data.breakStart = f.pbreakstart.value;
        data.breakEnd = f.pbreakend.value;
        data.days = [...document.querySelectorAll("#pdays input:checked")].map((c) => c.value);
      }
      try {
        me = await api("/profile", "PUT", data);
        if (me.role === "student") {
          $("pAvatar").textContent = initials(me.name);
          $("pName").textContent = me.name;
        }
        renderNav();
        f.ppass.value = "";
        showMsg("msg", "Profile saved.", true);
      } catch (err) {
        showMsg("msg", err.message);
      }
    };
  });
