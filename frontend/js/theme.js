try {
  const role = localStorage.getItem("tas_role");
  if (role === "student" || (!role && document.body.hasAttribute("data-public")))
    document.body.classList.add("student");
} catch (e) {
  if (document.body.hasAttribute("data-public")) document.body.classList.add("student");
}
