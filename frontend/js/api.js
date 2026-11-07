const $ = (id) => document.getElementById(id);
let me = null;

async function api(path, method = "GET", body) {
  let res;
  try {
    res = await fetch("/api" + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error("Cannot reach the server. Is it running? Open http://localhost:3000");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "Something went wrong.");
  return data;
}

function today() {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

const ready = api("/me")
  .then((u) => {
    me = u;
  })
  .catch(() => {
    me = null;
  })
  .then(() => {
    try {
      me ? localStorage.setItem("tas_role", me.role) : localStorage.removeItem("tas_role");
    } catch (e) {}
    document.body.classList.toggle(
      "student",
      me ? me.role === "student" : document.body.hasAttribute("data-public"),
    );
  });
