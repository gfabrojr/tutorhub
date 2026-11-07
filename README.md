# TutorHub - Tutor Appointment and Management System
HTML, CSS and JavaScript front-end, a Node.js + Express backend, and a MySQL database.

## Run it
You need Node.js (18 or newer) and MySQL (MySQL Community Server, or XAMPP with MySQL started).

1. Open a terminal in the `backend` folder and run `npm install`.
2. Copy `.env.example` to a new file named `.env`, then put your MySQL password in `DB_PASSWORD`.
3. Run `npm start`.
4. Open **http://localhost:3000** in your browser (do not open the HTML files directly).

On the first run the server creates the `tutorhub` database and tables (from `database/schema.sql`) and adds the demo accounts. You can also run `database/schema.sql` yourself in MySQL Workbench.

The same demo logins are listed on the home page (`frontend/index.html`). If you change a demo password, update that list too. New registrations are students. Admins add tutors and set each tutor's password when creating the account.

## Booking rules (checked by the server)
- **Tutor schedule:** each tutor sets the days they work, their start and end of day, and an optional break (Profile page). New tutors start with Mon to Fri, 9:00 AM - 5:00 PM, break 12:00 PM - 1:00 PM.
- **Start times:** students can start a session at any 15-minute mark (9:00, 9:15, 10:30, ...). The list only shows times that are in the future, inside working hours, outside the break, and not taken by an Approved appointment. A student also cannot book two sessions that overlap.
- All times are shown in 12-hour format (AM/PM). Each session lasts 1 hour.
- **Reschedule:** a student can ask to move a Pending or Approved appointment up to 24 hours before it starts. A Pending one moves right away. An Approved one keeps its old time until the tutor accepts the new time (or declines it). The student can withdraw the request.
- **Cancel:** students can cancel Pending/Approved appointments up to 24 hours before the start.
- Tutors approve/reject Pending requests, and can mark an Approved session as completed once it has started. A Pending request whose time has passed is shown as Expired. Admins can set any status.
- To test "Completed" in a demo, book a time a little later today, approve it, and mark it completed after it starts.

## Updating an older database
If you already ran an earlier version, just start the server again. It adds the new schedule columns by itself and gives existing tutors the default hours. Nothing is deleted.

## Folders
- `frontend/` - the pages. `js/api.js` talks to the server, `js/auth.js` login/register/guard, `js/main.js` nav + helpers, `js/appointments.js`, `js/tutors.js` the pages, `js/dashboard.js` the tutor and admin dashboards, `js/student-dashboard.js` the student dashboard. `css/student.css` + `js/theme.js` give every student page its colourful look (tutor and admin pages keep the plain navy look). The home, login and register pages use the colourful look for visitors who are not logged in.
- `backend/` - `server.js` (all /api routes and the booking rules), `db.js` (MySQL connection, setup, demo data).
- `database/schema.sql` - the two tables: `users` and `appointments`.

## Notes
- Passwords are hashed with bcrypt. Login uses a session cookie.
- Removing a user also removes their appointments (ON DELETE CASCADE).
- A tutor's subjects and time slots are stored as comma-separated text (e.g. `Math,Physics`), so it works on both MySQL and XAMPP's MariaDB. Move them into their own tables later if you need to.
- The old localStorage data is no longer used.

## If something goes wrong
- `Access denied for user` - wrong `DB_PASSWORD` in `.env`.
- `ECONNREFUSED` - MySQL is not running. Start the MySQL service (or XAMPP).
- `EADDRINUSE` - port 3000 is busy. Change `PORT` in `.env` and open that port instead.
