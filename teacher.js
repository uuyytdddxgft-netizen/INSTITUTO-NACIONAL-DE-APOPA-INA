(function () {
  "use strict";

  const loginPanel = document.querySelector("#teacher-login");
  const dashboard = document.querySelector("#teacher-dashboard");
  const loginForm = document.querySelector("#teacher-login-form");
  const loginEmail = document.querySelector("#teacher-email");
  const loginMessage = document.querySelector("#teacher-login-message");
  const errorMessage = document.querySelector("#teacher-error");
  const reportsList = document.querySelector("#teacher-report-list");
  const filtersForm = document.querySelector("#teacher-filters");
  const signOutButton = document.querySelector("#teacher-sign-out");
  const pageSize = 30;
  let offset = 0;
  let total = 0;

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function getFilters() {
    const data = new FormData(filtersForm);
    return {
      from: data.get("from"),
      to: data.get("to"),
      category: data.get("category"),
      studentId: data.get("studentId"),
      search: String(data.get("search") || "").trim(),
      offset,
      limit: pageSize,
    };
  }

  function renderPhotoLink(report, path) {
    const button = createElement("button", "teacher-photo-button", "Ver foto privada");
    button.type = "button";
    button.addEventListener("click", async () => {
      button.disabled = true;
      const photoWindow = window.open("about:blank", "_blank");
      try {
        const url = await window.INACloud.createPhotoUrl(report.id, path);
        if (!photoWindow) throw new Error("El navegador bloqueó la ventana segura de la foto.");
        photoWindow.opener = null;
        photoWindow.location = url;
      } catch (error) {
        if (photoWindow) photoWindow.close();
        errorMessage.textContent = "No tienes autorización para abrir esta foto o ya no está disponible.";
        console.error("No se pudo acceder a la foto del reporte:", error);
      } finally {
        button.disabled = false;
      }
    });
    return button;
  }

  function renderReport(report) {
    const article = createElement("article", "report-card teacher-report-card");
    const level = createElement("span", `level-badge level-${report.severity}`, report.severity);
    const heading = createElement("div", "teacher-report-heading");
    heading.append(createElement("h2", "", report.category), level);
    article.append(heading);
    article.append(createElement("p", "report-meta", `${report.location} · ${new Intl.DateTimeFormat("es-SV", { dateStyle: "full", timeStyle: "short" }).format(new Date(report.created_at))}`));
    const reporter = report.source === "adult"
      ? "Adulto responsable"
      : report.source === "local_migration" ? "Reporte anterior" : "Estudiante";
    article.append(createElement("p", "teacher-student-ref", `Reportado por: ${reporter}`));
    article.append(createElement("p", "report-description", report.description));

    const statusRow = createElement("div", "teacher-status-row");
    statusRow.append(createElement("span", "report-status", `Estado: ${report.status}`));
    const select = document.createElement("select");
    select.setAttribute("aria-label", `Cambiar estado del reporte ${report.id}`);
    for (const status of ["Recibido", "En revisión", "En atención", "Resuelto"]) {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      option.selected = status === report.status;
      select.append(option);
    }
    select.addEventListener("change", async () => {
      select.disabled = true;
      try {
        await window.INACloud.updateReportStatus(report.id, select.value);
        await loadReports();
      } catch (error) {
        errorMessage.textContent = "No se pudo actualizar el estado. Verifica tu autorización institucional.";
        console.error("No se pudo cambiar el estado del reporte:", error);
        select.disabled = false;
      }
    });
    statusRow.append(select);
    article.append(statusRow);

    const syncLabel = report.sync_status === "synced" ? "Sincronizado" : "Pendiente de sincronización";
    article.append(createElement("p", "sync-status", syncLabel));
    if (report.photo_paths && report.photo_paths.length) {
      const photos = createElement("div", "teacher-photo-actions");
      report.photo_paths.forEach((path) => photos.append(renderPhotoLink(report, path)));
      article.append(photos);
    }
    return article;
  }

  async function loadReports() {
    errorMessage.textContent = "";
    const currentOffset = offset;
    try {
      const response = await window.INACloud.listTeacherReports(getFilters());
      if (currentOffset !== offset) return;
      reportsList.replaceChildren();
      total = response.length ? Number(response[0].total_count) : 0;
      response.forEach((report) => reportsList.append(renderReport(report)));
      document.querySelector("#result-count").textContent = String(total);
      document.querySelector("#pending-count").textContent = String(
        response.filter((report) => report.status !== "Resuelto").length,
      );
      const recentCutoff = Date.now() - 24 * 60 * 60 * 1000;
      document.querySelector("#recent-count").textContent = String(
        response.filter((report) => new Date(report.created_at).getTime() >= recentCutoff).length,
      );
      document.querySelector("#page-label").textContent =
        `Página ${Math.floor(offset / pageSize) + 1} · ${total} reportes`;
      document.querySelector("#previous-page").disabled = offset === 0;
      document.querySelector("#next-page").disabled = offset + pageSize >= total;
      if (!response.length) reportsList.append(createElement("div", "empty-state", "No se encontraron reportes autorizados."));
    } catch (error) {
      reportsList.replaceChildren();
      errorMessage.textContent = "No se pudieron cargar reportes. La sesión puede haber expirado o la cuenta no estar autorizada.";
      console.error("Falló la búsqueda del panel docente:", error);
    }
  }

  async function initialize() {
    if (!window.INACloud.configured) {
      document.querySelector("#teacher-setup-note").textContent =
        "Panel desactivado: primero configura Supabase en cloud-config.js y aplica supabase-schema.sql.";
      loginForm.querySelector("button").disabled = true;
      return;
    }
    try {
      await window.INACloud.completeLoginFromUrl();
      const user = await window.INACloud.getCurrentUser();
      if (!user) return;
      const profile = await window.INACloud.getMyProfile();
      if (!profile?.authorized || !["teacher", "admin"].includes(profile.role)) {
        loginMessage.textContent = "Esta cuenta no está autorizada como docente por el instituto.";
        loginMessage.classList.add("is-error");
        return;
      }
      loginPanel.hidden = true;
      dashboard.hidden = false;
      signOutButton.hidden = false;
      await loadReports();
    } catch (error) {
      loginMessage.textContent = "No se pudo verificar el acceso. Solicita autorización institucional o vuelve a abrir el enlace recibido.";
      loginMessage.classList.add("is-error");
      console.error("Falló la autenticación del panel docente:", error);
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginMessage.textContent = "";
    loginMessage.classList.remove("is-error");
    const button = loginForm.querySelector("button");
    button.disabled = true;
    try {
      await window.INACloud.sendMagicLink(
        loginEmail.value.trim().toLowerCase(),
        new URL("teacher.html", window.location.href).href,
      );
      loginMessage.textContent = "Si la cuenta está autorizada, recibirás un enlace de acceso en el correo institucional.";
    } catch (error) {
      loginMessage.textContent = "No se pudo enviar el enlace seguro. Revisa el correo o contacta a la administración.";
      loginMessage.classList.add("is-error");
      console.error("No se pudo enviar el enlace docente:", error);
    } finally {
      button.disabled = false;
    }
  });

  filtersForm.addEventListener("submit", (event) => {
    event.preventDefault();
    offset = 0;
    loadReports();
  });

  document.querySelector("#previous-page").addEventListener("click", () => {
    offset = Math.max(0, offset - pageSize);
    loadReports();
  });
  document.querySelector("#next-page").addEventListener("click", () => {
    if (offset + pageSize < total) {
      offset += pageSize;
      loadReports();
    }
  });

  signOutButton.addEventListener("click", async () => {
    try {
      await window.INACloud.signOut();
      window.location.reload();
    } catch (error) {
      errorMessage.textContent = "No se pudo cerrar sesión.";
      console.error("Falló el cierre de sesión docente:", error);
    }
  });

  initialize();
})();
