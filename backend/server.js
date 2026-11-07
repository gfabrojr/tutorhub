require("dotenv").config({ quiet: true });
const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { pool, initDb, DEFAULT_HOURS } = require("./db");

const app = express();
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-this-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", maxAge: 8 * 3600 * 1000 },
  }),
);
app.use(express.static(path.join(__dirname, "../frontend")));

const STATUSES = ["Pending", "Approved", "Rejected", "Completed", "Cancelled"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STEP = 15;
const LENGTH = 60;
const NOTICE_HOURS = 24;
const validEmail = (e) => /^\S+@\S+\.\S+$/.test(e);
const validTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || "");
const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !isNaN(new Date(s + "T00:00"));
const pad = (n) => String(n).padStart(2, "0");
const toMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const toHHMM = (m) => pad(Math.floor(m / 60)) + ":" + pad(m % 60);
const hhmm = (t) => (t ? String(t).slice(0, 5) : null);
const addHour = (s) => toHHMM(toMin(s) + LENGTH);
const localISO = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const startOf = (date, time) => new Date(date + "T" + hhmm(time));
const toList = (text) => (text ? text.split(",") : []);
const cleanList = (arr) =>
  (Array.isArray(arr) ? arr : []).map((s) => String(s).replace(/,/g, " ").trim()).filter(Boolean);
const fail = (res, code, message) => res.status(code).json({ error: message });
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  subjects: toList(u.subjects),
  rate: u.rate,
  workStart: hhmm(u.work_start),
  workEnd: hhmm(u.work_end),
  breakStart: hhmm(u.break_start),
  breakEnd: hhmm(u.break_end),
  days: toList(u.days),
  bio: u.bio || "",
});

const canChange = (a) =>
  ["Pending", "Approved"].includes(a.status) &&
  startOf(a.appt_date, a.start_time) - new Date() >= NOTICE_HOURS * 3600 * 1000;

const APPT_SQL = `SELECT a.*, s.name AS student_name, t.name AS tutor_name
  FROM appointments a
  JOIN users s ON s.id = a.student_id
  JOIN users t ON t.id = a.tutor_id`;
const publicAppt = (a, role) => ({
  id: a.id,
  studentId: a.student_id,
  studentName: a.student_name,
  tutorId: a.tutor_id,
  tutorName: a.tutor_name,
  subject: a.subject,
  date: a.appt_date,
  start: hhmm(a.start_time),
  end: hhmm(a.end_time),
  mode: a.mode,
  notes: a.notes || "",
  status: a.status,
  created: a.created,
  request: a.new_date
    ? { date: a.new_date, start: hhmm(a.new_start), end: hhmm(a.new_end), reason: a.change_reason || "" }
    : null,
  canChange: role === "student" && canChange(a),
});

const need = (...roles) => (req, res, next) => {
  if (!req.session.userId) return fail(res, 401, "Please log in.");
  if (roles.length && !roles.includes(req.session.role)) return fail(res, 403, "You are not allowed to do that.");
  next();
};

async function hasClash(tutorId, date, start, end, ignoreId = 0) {
  const [rows] = await pool.query(
    `SELECT id FROM appointments
     WHERE tutor_id = ? AND appt_date = ? AND status = 'Approved' AND id <> ?
       AND start_time < ? AND end_time > ? LIMIT 1`,
    [tutorId, date, ignoreId, end, start],
  );
  return rows.length > 0;
}

async function freeTimes(tutor, date, studentId = 0, ignoreId = 0) {
  const now = new Date(),
    todayISO = localISO(now);
  if (date < todayISO || !tutor.work_start || !tutor.work_end) return [];
  if (!toList(tutor.days).includes(DAY_NAMES[new Date(date + "T00:00").getDay()])) return [];
  const ws = toMin(hhmm(tutor.work_start)),
    we = toMin(hhmm(tutor.work_end));
  const bs = tutor.break_start ? toMin(hhmm(tutor.break_start)) : null,
    be = tutor.break_end ? toMin(hhmm(tutor.break_end)) : null;
  const [rows] = await pool.query(
    `SELECT start_time, end_time FROM appointments
     WHERE appt_date = ? AND id <> ?
       AND ((tutor_id = ? AND status = 'Approved') OR (student_id = ? AND status IN ('Pending', 'Approved')))`,
    [date, ignoreId, tutor.id, studentId],
  );
  const busy = rows.map((r) => [toMin(hhmm(r.start_time)), toMin(hhmm(r.end_time))]);
  const nowMin = date === todayISO ? now.getHours() * 60 + now.getMinutes() : -1;
  const out = [];
  for (let s = ws; s + LENGTH <= we; s += STEP) {
    const e = s + LENGTH;
    if (s <= nowMin) continue;
    if (bs !== null && be !== null && s < be && e > bs) continue;
    if (busy.some(([bStart, bEnd]) => s < bEnd && e > bStart)) continue;
    out.push(toHHMM(s));
  }
  return out;
}

function readSchedule(b) {
  if (!validTime(b.workStart) || !validTime(b.workEnd)) return { error: "Choose the time you start and finish each day." };
  if (toMin(b.workEnd) - toMin(b.workStart) < LENGTH) return { error: "Your working hours must be at least one hour long." };
  const hasBreak = b.breakStart || b.breakEnd;
  if (hasBreak) {
    if (!validTime(b.breakStart) || !validTime(b.breakEnd))
      return { error: "Choose both the start and the end of your break, or choose No break." };
    if (toMin(b.breakEnd) <= toMin(b.breakStart)) return { error: "Your break must end after it starts." };
    if (toMin(b.breakStart) < toMin(b.workStart) || toMin(b.breakEnd) > toMin(b.workEnd))
      return { error: "Your break must be inside your working hours." };
  }
  const days = WEEK.filter((d) => Array.isArray(b.days) && b.days.includes(d));
  if (!days.length) return { error: "Choose at least one day you are available." };
  return {
    values: [b.workStart, b.workEnd, hasBreak ? b.breakStart : null, hasBreak ? b.breakEnd : null, days.join(",")],
  };
}

app.post(
  "/api/register",
  wrap(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!name || !email || !password) return fail(res, 400, "Please fill in all fields.");
    if (!validEmail(email)) return fail(res, 400, "Enter a valid email address.");
    if (password.length < 6) return fail(res, 400, "Password must be at least 6 characters.");
    const [dupe] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    if (dupe.length) return fail(res, 409, "That email is already registered.");
    await pool.query("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'student')", [
      name,
      email,
      await bcrypt.hash(password, 10),
    ]);
    res.status(201).json({ ok: true });
  }),
);

app.post(
  "/api/login",
  wrap(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    const u = rows[0];
    if (!u || !(await bcrypt.compare(String(req.body.password || ""), u.password)))
      return fail(res, 401, "Wrong email or password.");
    req.session.userId = u.id;
    req.session.role = u.role;
    res.json(publicUser(u));
  }),
);

app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get(
  "/api/me",
  wrap(async (req, res) => {
    if (!req.session.userId) return res.json(null);
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [req.session.userId]);
    res.json(rows[0] ? publicUser(rows[0]) : null);
  }),
);

app.put(
  "/api/profile",
  need(),
  wrap(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const password = String(req.body.password || "");
    if (!name) return fail(res, 400, "Name is required.");
    if (password && password.length < 6) return fail(res, 400, "Password must be at least 6 characters.");
    const [[u]] = await pool.query("SELECT * FROM users WHERE id = ?", [req.session.userId]);
    const sets = ["name = ?"],
      vals = [name];
    if (password) {
      sets.push("password = ?");
      vals.push(await bcrypt.hash(password, 10));
    }
    if (u.role === "tutor") {
      const sched = readSchedule(req.body);
      if (sched.error) return fail(res, 400, sched.error);
      sets.push("subjects = ?", "rate = ?", "work_start = ?", "work_end = ?", "break_start = ?", "break_end = ?", "days = ?");
      vals.push(cleanList(req.body.subjects).join(","), +req.body.rate || 0, ...sched.values);
    }
    await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, [...vals, u.id]);
    const [[fresh]] = await pool.query("SELECT * FROM users WHERE id = ?", [u.id]);
    res.json(publicUser(fresh));
  }),
);

app.get(
  "/api/users",
  need("admin"),
  wrap(async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM users ORDER BY id");
    res.json(rows.map(publicUser));
  }),
);

app.delete(
  "/api/users/:id",
  need("admin"),
  wrap(async (req, res) => {
    const [r] = await pool.query("DELETE FROM users WHERE id = ? AND role <> 'admin'", [req.params.id]);
    if (!r.affectedRows) return fail(res, 404, "User not found.");
    res.json({ ok: true });
  }),
);

async function tutorError(b, ignoreId = 0) {
  if (!String(b.name || "").trim() || !b.email || !cleanList(b.subjects).length || b.rate === "" || b.rate == null)
    return "Please fill in all tutor fields.";
  if (!validEmail(String(b.email).trim().toLowerCase())) return "Enter a valid email address.";
  const [dupe] = await pool.query("SELECT id FROM users WHERE email = ? AND id <> ?", [
    String(b.email).trim().toLowerCase(),
    ignoreId,
  ]);
  return dupe.length ? "That email is already used." : "";
}

app.post(
  "/api/tutors",
  need("admin"),
  wrap(async (req, res) => {
    const err = await tutorError(req.body);
    if (err) return fail(res, 400, err);
    const b = req.body;
    const password = String(b.password || "");
    if (!password) return fail(res, 400, "Please fill in all tutor fields.");
    if (password.length < 6) return fail(res, 400, "Password must be at least 6 characters.");
    await pool.query(
      "INSERT INTO users (name, email, password, role, subjects, rate, work_start, work_end, break_start, break_end, days, bio) VALUES (?, ?, ?, 'tutor', ?, ?, ?, ?, ?, ?, ?, '')",
      [
        String(b.name).trim(),
        String(b.email).trim().toLowerCase(),
        await bcrypt.hash(password, 10),
        cleanList(b.subjects).join(","),
        +b.rate,
        ...DEFAULT_HOURS,
      ],
    );
    res.status(201).json({ ok: true });
  }),
);

app.put(
  "/api/tutors/:id",
  need("admin"),
  wrap(async (req, res) => {
    const err = await tutorError(req.body, +req.params.id);
    if (err) return fail(res, 400, err);
    const b = req.body;
    const [r] = await pool.query(
      "UPDATE users SET name = ?, email = ?, subjects = ?, rate = ? WHERE id = ? AND role = 'tutor'",
      [String(b.name).trim(), String(b.email).trim().toLowerCase(), cleanList(b.subjects).join(","), +b.rate, req.params.id],
    );
    if (!r.affectedRows) return fail(res, 404, "Tutor not found.");
    res.json({ ok: true });
  }),
);

app.get(
  "/api/tutors",
  need(),
  wrap(async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM users WHERE role = 'tutor' ORDER BY name");
    res.json(
      rows.map((r) => {
        const t = publicUser(r);
        if (req.session.role !== "admin") delete t.email;
        return t;
      }),
    );
  }),
);

app.get(
  "/api/tutors/:id/free-times",
  need(),
  wrap(async (req, res) => {
    const date = String(req.query.date || "");
    if (!validDate(date)) return fail(res, 400, "Pick a valid date.");
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ? AND role = 'tutor'", [req.params.id]);
    if (!rows[0]) return fail(res, 404, "Tutor not found.");
    const studentId = req.session.role === "student" ? req.session.userId : 0;
    let ignoreId = 0;
    if (studentId && +req.query.exclude) {
      const [own] = await pool.query("SELECT id FROM appointments WHERE id = ? AND student_id = ?", [+req.query.exclude, studentId]);
      if (own[0]) ignoreId = own[0].id;
    }
    res.json(await freeTimes(rows[0], date, studentId, ignoreId));
  }),
);

app.get(
  "/api/appointments",
  need(),
  wrap(async (req, res) => {
    const { role, userId } = req.session;
    const where = role === "student" ? "WHERE a.student_id = ?" : role === "tutor" ? "WHERE a.tutor_id = ?" : "";
    const [rows] = await pool.query(`${APPT_SQL} ${where} ORDER BY a.id DESC`, where ? [userId] : []);
    res.json(rows.map((a) => publicAppt(a, role)));
  }),
);

app.post(
  "/api/appointments",
  need("student"),
  wrap(async (req, res) => {
    const { tutorId, subject, date, start, mode } = req.body;
    const notes = String(req.body.notes || "").trim();
    if (!subject || !date || !start || !mode)
      return fail(res, 400, "Please choose a subject, date, start time, and learning mode.");
    if (!validDate(date) || !validTime(start)) return fail(res, 400, "Invalid date or time.");
    if (!["Online", "Face-to-face"].includes(mode)) return fail(res, 400, "Invalid learning mode.");
    if (startOf(date, start) < new Date()) return fail(res, 400, "You cannot book a time in the past.");
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ? AND role = 'tutor'", [tutorId]);
    const tutor = rows[0];
    if (!tutor) return fail(res, 404, "Tutor not found.");
    if (!toList(tutor.subjects).includes(subject)) return fail(res, 400, "This tutor does not teach that subject.");
    if (!(await freeTimes(tutor, date, req.session.userId)).includes(start))
      return fail(res, 409, "That time is not available. Please choose one of the listed times.");
    await pool.query(
      `INSERT INTO appointments
         (student_id, tutor_id, subject, appt_date, start_time, end_time, mode, notes, status, created)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', CURDATE())`,
      [req.session.userId, tutor.id, subject, date, start, addHour(start), mode, notes],
    );
    res.status(201).json({ ok: true });
  }),
);

app.patch(
  "/api/appointments/:id",
  need(),
  wrap(async (req, res) => {
    const status = req.body.status;
    if (!STATUSES.includes(status)) return fail(res, 400, "Invalid status.");
    const [rows] = await pool.query("SELECT * FROM appointments WHERE id = ?", [req.params.id]);
    const a = rows[0];
    if (!a) return fail(res, 404, "Appointment not found.");
    const { role, userId } = req.session;
    if (role === "student" && (a.student_id !== userId || status !== "Cancelled" || !canChange(a)))
      return fail(res, 403, `You can only cancel your own Pending or Approved appointment at least ${NOTICE_HOURS} hours before it starts.`);
    if (role === "tutor") {
      const allowed =
        (a.status === "Pending" && ["Approved", "Rejected"].includes(status)) ||
        (a.status === "Approved" && status === "Completed");
      if (a.tutor_id !== userId || !allowed) return fail(res, 403, "That status change is not allowed.");
    }
    const begins = startOf(a.appt_date, a.start_time);
    if (status === "Approved" && begins < new Date()) return fail(res, 400, "This appointment time has already passed.");
    if (status === "Completed" && begins > new Date())
      return fail(res, 400, "You can mark a session as completed only after it has started.");
    if (status === "Approved" && (await hasClash(a.tutor_id, a.appt_date, hhmm(a.start_time), hhmm(a.end_time), a.id)))
      return fail(res, 409, "This overlaps another approved appointment.");
    await pool.query(
      "UPDATE appointments SET status = ?, new_date = NULL, new_start = NULL, new_end = NULL, change_reason = NULL WHERE id = ?",
      [status, a.id],
    );
    res.json({ ok: true });
  }),
);

app.post(
  "/api/appointments/:id/reschedule",
  need("student"),
  wrap(async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM appointments WHERE id = ? AND student_id = ?", [req.params.id, req.session.userId]);
    const a = rows[0];
    if (!a) return fail(res, 404, "Appointment not found.");
    if (!canChange(a))
      return fail(res, 403, `You can only reschedule a Pending or Approved appointment at least ${NOTICE_HOURS} hours before it starts.`);
    const { date, start } = req.body;
    const reason = String(req.body.reason || "").trim().slice(0, 255);
    if (!validDate(date) || !validTime(start)) return fail(res, 400, "Choose a new date and start time.");
    if (date === a.appt_date && start === hhmm(a.start_time)) return fail(res, 400, "That is already the time of this appointment.");
    if (startOf(date, start) < new Date()) return fail(res, 400, "You cannot pick a time in the past.");
    const [t] = await pool.query("SELECT * FROM users WHERE id = ?", [a.tutor_id]);
    if (!t[0] || !(await freeTimes(t[0], date, a.student_id, a.id)).includes(start))
      return fail(res, 409, "That time is not available. Please choose one of the listed times.");
    if (a.status === "Pending") {
      await pool.query(
        "UPDATE appointments SET appt_date = ?, start_time = ?, end_time = ?, new_date = NULL, new_start = NULL, new_end = NULL, change_reason = NULL WHERE id = ?",
        [date, start, addHour(start), a.id],
      );
      return res.json({ moved: true });
    }
    await pool.query("UPDATE appointments SET new_date = ?, new_start = ?, new_end = ?, change_reason = ? WHERE id = ?", [
      date,
      start,
      addHour(start),
      reason,
      a.id,
    ]);
    res.json({ requested: true });
  }),
);

app.post(
  "/api/appointments/:id/reschedule/accept",
  need("tutor", "admin"),
  wrap(async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM appointments WHERE id = ?", [req.params.id]);
    const a = rows[0];
    if (!a || (req.session.role === "tutor" && a.tutor_id !== req.session.userId)) return fail(res, 404, "Appointment not found.");
    if (!a.new_date || a.status !== "Approved") return fail(res, 404, "There is no reschedule request to accept.");
    const start = hhmm(a.new_start),
      end = hhmm(a.new_end);
    if (startOf(a.new_date, start) < new Date())
      return fail(res, 400, "The requested time has already passed. Please decline the request.");
    if (await hasClash(a.tutor_id, a.new_date, start, end, a.id))
      return fail(res, 409, "The requested time overlaps another approved appointment.");
    await pool.query(
      "UPDATE appointments SET appt_date = ?, start_time = ?, end_time = ?, new_date = NULL, new_start = NULL, new_end = NULL, change_reason = NULL WHERE id = ?",
      [a.new_date, start, end, a.id],
    );
    res.json({ ok: true });
  }),
);

app.delete(
  "/api/appointments/:id/reschedule",
  need(),
  wrap(async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM appointments WHERE id = ?", [req.params.id]);
    const a = rows[0];
    const { role, userId } = req.session;
    const mine = a && (role === "admin" || (role === "student" && a.student_id === userId) || (role === "tutor" && a.tutor_id === userId));
    if (!mine || !a.new_date) return fail(res, 404, "There is no reschedule request.");
    await pool.query(
      "UPDATE appointments SET new_date = NULL, new_start = NULL, new_end = NULL, change_reason = NULL WHERE id = ?",
      [a.id],
    );
    res.json({ ok: true });
  }),
);

app.use((err, req, res, next) => {
  console.error(err);
  fail(res, 500, "Server error. Check the terminal where the server is running.");
});

const PORT = process.env.PORT || 3000;
initDb()
  .then(() => app.listen(PORT, () => console.log(`TutorHub is running at http://localhost:${PORT}`)))
  .catch((err) => {
    console.error("Could not set up the database:", err.message);
    console.error("Check that MySQL is running and that DB_USER / DB_PASSWORD in backend/.env are correct.");
    process.exit(1);
  });
