const HOME = {
  student: "student-dashboard.html",
  tutor: "tutor-dashboard.html",
  admin: "admin-dashboard.html",
};
const validEmail = (e) => /^\S+@\S+\.\S+$/.test(e);
function showMsg(id, text, ok) {
  const el = $(id);
  if (el) {
    el.textContent = text;
    el.className = "msg " + (ok ? "ok" : "err");
  }
}
async function logout() {
  await api("/logout", "POST").catch(() => {});
  location.href = "login.html";
}
function guard(role) {
  if (!me || (role && me.role !== role)) {
    location.href = me ? HOME[me.role] : "login.html";
    throw new Error("Redirecting");
  }
}

if ($("loginForm"))
  $("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target,
      email = f.email.value.trim().toLowerCase();
    if (!email || !f.password.value) return showMsg("msg", "Please enter your email and password.");
    if (!validEmail(email)) return showMsg("msg", "Enter a valid email address.");
    try {
      const u = await api("/login", "POST", { email, password: f.password.value });
      location.href = HOME[u.role];
    } catch (err) {
      showMsg("msg", err.message);
    }
  };

if ($("regForm"))
  $("regForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target,
      email = f.email.value.trim().toLowerCase();
    if (!f.fullname.value.trim() || !email || !f.password.value || !f.confirmPw.value)
      return showMsg("msg", "Please fill in all fields.");
    if (!validEmail(email)) return showMsg("msg", "Enter a valid email address.");
    if (f.password.value.length < 6)
      return showMsg("msg", "Password must be at least 6 characters.");
    if (f.password.value !== f.confirmPw.value) return showMsg("msg", "Passwords do not match.");
    try {
      await api("/register", "POST", {
        name: f.fullname.value.trim(),
        email,
        password: f.password.value,
      });
      showMsg("msg", "Account created. Taking you to the login page...", true);
      setTimeout(() => (location.href = "login.html"), 1200);
    } catch (err) {
      showMsg("msg", err.message);
    }
  };
