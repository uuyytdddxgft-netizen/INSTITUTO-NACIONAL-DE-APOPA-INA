const DATABASE_NAME = "ina-reporta";
const DATABASE_VERSION = 4;
const REPORT_STORE = "reports";
const SESSION_KEY = "ina-reporta.demo-student-email";
const ANONYMOUS_SESSION_KEY = "ina-reporta.anonymous-session";
const INSTITUTIONAL_EMAIL_PATTERN = /^[a-z0-9._-]+@clases\.edu\.sv$/i;
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const WHATSAPP_RECIPIENTS = [
  { label: "Maestro de prueba 1", phone: "50375988562" },
  { label: "Maestro de prueba 2", phone: "50374856482" },
];
const levels = {
  bajo: { label: "Bajo", color: "#167348", background: "#e8f6ee" },
  medio: { label: "Medio", color: "#9a6900", background: "#fff5d6" },
  critico: { label: "Crítico", color: "#bd3037", background: "#fff0ef" },
  peligro: { label: "Peligro", color: "#861d29", background: "#fce9eb" },
};

let databasePromise;
let selectedPhotos = [];
let previewObjectUrls = [];
let reportObjectUrls = [];
let dayResetTimer;
const form = document.querySelector("#report-form");
const formMessage = document.querySelector("#form-message");
const reportList = document.querySelector("#report-list");
const reportCount = document.querySelector("#report-count");
const characterCount = document.querySelector("#character-count");
const descriptionField = document.querySelector("#description");
const photoInput = document.querySelector("#photos");
const photoPreviewList = document.querySelector("#photo-preview-list");
const reportPanel = document.querySelector("#report-panel");
const listPanel = document.querySelector("#list-panel");
const splashScreen = document.querySelector("#splash-screen");
const accessScreen = document.querySelector("#access-screen");
const appShell = document.querySelector("#app-shell");
const accessForm = document.querySelector("#student-access-form");
const accessMessage = document.querySelector("#access-message");
const studentEmailField = document.querySelector("#student-email");
let activeFilter = "todos";

function getAnonymousSessionId() {
  if (window.INACloud?.session?.user) return window.INACloud.session.user.id;
  return sessionStorage.getItem(ANONYMOUS_SESSION_KEY);
}

function getStudentEmail() {
  return sessionStorage.getItem(SESSION_KEY);
}

function createAnonymousSessionId() {
  if (!window.crypto || typeof window.crypto.randomUUID !== "function") {
    throw new Error("Este navegador no puede crear una sesión anónima segura.");
  }
  return window.crypto.randomUUID();
}

function showApp(email) {
  try {
    if (!window.INACloud?.configured) {
      sessionStorage.setItem(SESSION_KEY, email);
    }
    if (!window.INACloud?.session?.user && !getAnonymousSessionId()) {
      sessionStorage.setItem(ANONYMOUS_SESSION_KEY, createAnonymousSessionId());
    }
  } catch (error) {
    accessMessage.textContent = "No se pudo iniciar una sesión privada en este navegador. Activa el almacenamiento del sitio e inténtalo de nuevo.";
    accessMessage.classList.add("is-error");
    console.error("No se pudo crear la sesión de demostración:", error);
    return;
  }
  accessScreen.hidden = true;
  appShell.hidden = false;
  formMessage.textContent = "";
  formMessage.classList.remove("is-error");
  document.querySelector("#role-tag").textContent = "Estudiante";
  document.querySelector("#migration-panel").hidden = !window.INACloud?.configured;
  document.querySelector("#report-scope-note").textContent = window.INACloud?.configured
    ? "Solo tú puedes consultar tus reportes diarios. El sistema conserva el historial en la nube para docentes autorizados por el instituto."
    : "Esta lista muestra solo los reportes de hoy; mañana se inicia un día nuevo. Los reportes anteriores, con fecha y fotos, permanecen archivados en este dispositivo.";
  renderReports();
}

function openDatabase() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("Este navegador no permite el almacenamiento local de reportes."));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      const transaction = request.transaction;
      const store = database.objectStoreNames.contains(REPORT_STORE)
        ? transaction.objectStore(REPORT_STORE)
        : database.createObjectStore(REPORT_STORE, { keyPath: "code" });
      if (event.oldVersion < 3) {
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const report = cursor.value;
          delete report.studentEmail;
          if (!report.anonymousSessionId) report.anonymousSessionId = "legacy-unassigned";
          cursor.update(report);
          cursor.continue();
        };
      }
      if (event.oldVersion < 4) {
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const report = cursor.value;
          report.id ||= crypto.randomUUID();
          report.updatedAt ||= report.createdAt || new Date().toISOString();
          report.syncStatus ||= "local";
          cursor.update(report);
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error || new Error("No se pudo abrir el almacenamiento local."));
    request.onblocked = () => reject(new Error("Cierra otras pestañas de INA Reporta y vuelve a intentarlo."));
  });
  return databasePromise;
}

async function readReports() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(REPORT_STORE, "readonly");
    const request = transaction.objectStore(REPORT_STORE).getAll();
    let reports = [];
    request.onsuccess = () => {
      reports = request.result;
    };
    request.onerror = () => reject(request.error || new Error("No se pudieron leer los reportes."));
    transaction.oncomplete = () => resolve(reports);
    transaction.onerror = () => reject(transaction.error || new Error("No se pudieron leer los reportes."));
    transaction.onabort = () => reject(transaction.error || new Error("La lectura de reportes fue cancelada."));
  });
}

async function saveReport(report) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(REPORT_STORE, "readwrite");
    transaction.objectStore(REPORT_STORE).put(report);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("No se pudo guardar el reporte."));
    transaction.onabort = () => reject(transaction.error || new Error("El guardado del reporte fue cancelado."));
  });
}

async function updateLocalReport(report) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(REPORT_STORE, "readwrite");
    transaction.objectStore(REPORT_STORE).put(report);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("No se pudo actualizar el reporte local."));
    transaction.onabort = () => reject(transaction.error || new Error("Se canceló la actualización del reporte local."));
  });
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-SV", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function localDayRange() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
    to: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString(),
  };
}

function normalizeCloudReport(row) {
  return {
    ...row,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photoPaths: row.photo_paths || [],
    syncStatus: row.sync_status,
    code: row.id,
  };
}

async function syncPendingReports() {
  if (!window.INACloud?.configured || !window.INACloud.session?.user || !navigator.onLine) return;
  let reports;
  try {
    reports = await readReports();
  } catch (error) {
    console.error("No se pudo leer la cola local de sincronización:", error);
    return;
  }

  for (const report of reports) {
    if (report.anonymousSessionId !== getAnonymousSessionId() || report.syncStatus === "synced") continue;
    try {
      report.syncStatus = "pending";
      report.updatedAt = new Date().toISOString();
      await updateLocalReport(report);
      const synced = await window.INACloud.syncReport(report);
      report.syncStatus = synced.syncStatus;
      report.syncError = "";
      report.updatedAt = new Date().toISOString();
      await updateLocalReport(report);
    } catch (error) {
      report.syncStatus = "error";
      report.syncError = error.message;
      report.updatedAt = new Date().toISOString();
      await updateLocalReport(report);
      console.error(`No se pudo sincronizar ${report.code}:`, error);
    }
  }
}

function getLocalDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function updateReportingDate() {
  const reportingDate = document.querySelector("#reporting-date");
  reportingDate.textContent = new Intl.DateTimeFormat("es-SV", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function scheduleDayReset() {
  window.clearTimeout(dayResetTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  dayResetTimer = window.setTimeout(() => {
    updateReportingDate();
    if (!appShell.hidden && !listPanel.hidden) renderReports();
    scheduleDayReset();
  }, Math.max(1000, nextMidnight.getTime() - now.getTime() + 100));
}

function createWhatsappLink(report, recipient) {
  const level = levels[report.severity];
  const text = [
    "INA Reporta — reporte de prueba",
    `Categoría: ${report.category}`,
    `Lugar: ${report.location}`,
    `Fecha: ${formatDate(report.createdAt || report.created_at)}`,
    `Nivel: ${level ? level.label : "No indicado"}`,
    `Descripción: ${report.description}`,
    `Estado: ${report.status || "Recibido"}`,
    `Código: ${report.code}`,
    (report.photos && report.photos.length) || (report.photoPaths && report.photoPaths.length)
      ? `El reporte tiene ${(report.photos || report.photoPaths).length} foto(s); las adjuntaré manualmente en WhatsApp.`
      : "",
  ].filter(Boolean).join("\n");
  const link = createElement("a", "whatsapp-link", `Enviar texto a ${recipient.label}`);
  link.href = `https://wa.me/${recipient.phone}?text=${encodeURIComponent(text)}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

async function createReportCard(report) {
  const level = levels[report.severity];
  if (!level) return null;

  const card = createElement("article", "report-card");
  card.style.setProperty("--level-color", level.color);
  card.style.setProperty("--level-bg", level.background);
  const top = createElement("div", "report-card-top");
  top.append(
    createElement("h3", "", report.category),
    createElement("span", "level-badge", level.label),
  );
  card.append(top);
  card.append(createElement("p", "report-status", `Estado: ${report.status || "Recibido"}`));
  card.append(createElement("p", "report-meta", `${report.location} · ${formatDate(report.createdAt || report.created_at)}`));
  if (report.syncStatus === "pending") {
    card.append(createElement("p", "sync-status sync-pending", "Pendiente de sincronización"));
  } else if (report.syncStatus === "synced") {
    card.append(createElement("p", "sync-status sync-success", "Sincronizado"));
  } else if (report.syncStatus === "error") {
    card.append(createElement("p", "sync-status sync-error", "Error al sincronizar. Se reintentará automáticamente."));
  } else if (window.INACloud?.configured) {
    card.append(createElement("p", "sync-status sync-pending", "Pendiente de sincronización"));
  }
  card.append(createElement("p", "report-description", report.description));
  card.append(createElement("span", "report-code", `Código ${report.code}`));

  const localPhotos = report.photos || [];
  const remotePhotoPaths = report.photoPaths || report.photo_paths || [];
  if (localPhotos.length || remotePhotoPaths.length) {
    const photos = createElement("div", "report-photo-grid");
    for (const photo of localPhotos) {
      const image = document.createElement("img");
      image.src = URL.createObjectURL(photo.blob);
      reportObjectUrls.push(image.src);
      image.alt = "Foto adjunta al reporte";
      image.loading = "lazy";
      photos.append(image);
    }
    for (const path of remotePhotoPaths) {
      try {
        const image = document.createElement("img");
        image.src = await window.INACloud.createPhotoUrl(report.id, path);
        image.alt = "Foto adjunta al reporte sincronizado";
        image.loading = "lazy";
        photos.append(image);
      } catch (error) {
        console.error("No se pudo abrir una foto sincronizada:", error);
        photos.append(createElement("span", "photo-unavailable", "Foto no disponible"));
      }
    }
    card.append(photos);

    if (localPhotos.length) {
      const sharing = createElement("div", "report-sharing");
      const shareButton = createElement("button", "share-photo-button", "Compartir reporte y fotos");
      shareButton.type = "button";
      shareButton.addEventListener("click", async () => {
        const files = localPhotos.map((photo, index) =>
          new File([photo.blob], `INA-${report.code}-${index + 1}.jpg`, { type: photo.blob.type || "image/jpeg" }),
        );
        if (!navigator.share || !navigator.canShare || !navigator.canShare({ files })) {
          window.alert("Este navegador no permite compartir fotos desde aquí. Usa el enlace de WhatsApp y adjunta las fotos manualmente en el chat.");
          return;
        }
        try {
          await navigator.share({
            title: `INA Reporta ${report.code}`,
            text: `Reporte ${report.code}: ${report.category} en ${report.location}. ${report.description}`,
            files,
          });
        } catch (error) {
          if (error.name !== "AbortError") {
            console.error("No se pudieron compartir las fotos:", error);
            window.alert("No se pudieron compartir las fotos. Puedes adjuntarlas manualmente en WhatsApp.");
          }
        }
      });
      sharing.append(shareButton);
      card.append(sharing);
    }
  }

  const recipients = createElement("div", "whatsapp-links");
  for (const recipient of WHATSAPP_RECIPIENTS) {
    recipients.append(createWhatsappLink(report, recipient));
  }
  card.append(recipients);
  return card;
}

async function renderReports() {
  if (window.INACloud?.configured && window.INACloud.session?.user && navigator.onLine) {
    await syncPendingReports();
  }
  let reports;
  try {
    reports = await readReports();
  } catch (error) {
    for (const url of reportObjectUrls) URL.revokeObjectURL(url);
    reportObjectUrls = [];
    reportList.replaceChildren(
      createElement("p", "empty-state", "No se pudieron leer los reportes guardados. Prueba recargar la página."),
    );
    console.error("No se pudieron leer los reportes:", error);
    return;
  }

  let sessionReports = reports.filter((report) => report.anonymousSessionId === getAnonymousSessionId());
  if (window.INACloud?.configured && window.INACloud.session?.user && navigator.onLine) {
    try {
      const range = localDayRange();
      const remoteReports = await window.INACloud.listStudentReports(range.from, range.to);
      const localIds = new Set(sessionReports.map((report) => report.id));
      sessionReports = [
        ...sessionReports,
        ...remoteReports.map(normalizeCloudReport).filter((report) => !localIds.has(report.id)),
      ];
    } catch (error) {
      console.error("No se pudieron actualizar reportes desde la nube:", error);
    }
  }
  const todayKey = getLocalDateKey(new Date());
  const studentReports = sessionReports.filter((report) => getLocalDateKey(report.createdAt || report.created_at) === todayKey);
  const archivedReports = reports.filter((report) =>
    report.anonymousSessionId === getAnonymousSessionId() && getLocalDateKey(report.createdAt) !== todayKey,
  ).length;
  reportCount.textContent = String(studentReports.length);
  document.querySelector("#archive-count").textContent = String(archivedReports);
  updateReportingDate();
  for (const url of reportObjectUrls) URL.revokeObjectURL(url);
  reportObjectUrls = [];
  reportList.replaceChildren();
  const visibleReports = studentReports
    .filter((report) => activeFilter === "todos" || report.severity === activeFilter)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (visibleReports.length === 0) {
    const empty = createElement("div", "empty-state");
    const title = createElement("strong", "", studentReports.length ? "No hay reportes de este nivel" : "Todavía no hay reportes de hoy");
    const message = createElement("p", "", studentReports.length
      ? "Prueba con otro filtro."
      : archivedReports
        ? `${archivedReports} reporte(s) de días anteriores siguen guardados en el archivo local.`
        : "Cuando registres uno, aparecerá aquí.");
    empty.append(title, message);
    reportList.append(empty);
    return;
  }

  for (const report of visibleReports) {
    const card = await createReportCard(report);
    if (card) reportList.append(card);
  }
}

function showTab(tabName) {
  const showList = tabName === "list";
  reportPanel.hidden = showList;
  listPanel.hidden = !showList;
  document.querySelectorAll(".tab").forEach((tab) => {
    const selected = tab.dataset.tab === tabName;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  if (showList) renderReports();
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => showTab(tab.dataset.tab));
});

document.querySelector("[data-tab-link='report']").addEventListener("click", () => showTab("report"));

accessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  accessMessage.textContent = "";
  accessMessage.classList.remove("is-error");
  const email = studentEmailField.value.trim().toLowerCase();

  if (!INSTITUTIONAL_EMAIL_PATTERN.test(email)) {
    accessMessage.textContent = "Usa el formato de correo institucional autorizado.";
    accessMessage.classList.add("is-error");
    return;
  }

  if (window.INACloud?.configured) {
    const button = document.querySelector("#access-submit");
    button.disabled = true;
    try {
      await window.INACloud.sendMagicLink(email, new URL("index.html", window.location.href).href);
      accessMessage.textContent = "Si el INA autorizó esta cuenta, revisa su correo institucional y abre el enlace de acceso.";
    } catch (error) {
      accessMessage.textContent = "No se pudo enviar el enlace institucional. Revisa la cuenta o inténtalo más tarde.";
      accessMessage.classList.add("is-error");
      console.error("No se pudo enviar el acceso estudiantil:", error);
    } finally {
      button.disabled = false;
    }
    return;
  }

  accessMessage.textContent = "Modo de demostración: solo se valida el formato, no la identidad.";
  showApp(email);
});

document.querySelector("#sign-out").addEventListener("click", async () => {
  if (window.INACloud?.configured) {
    try {
      await window.INACloud.signOut();
    } catch (error) {
      console.error("No se pudo cerrar la sesión remota:", error);
      accessMessage.textContent = "No se pudo cerrar sesión con el servidor. Inténtalo otra vez.";
      accessMessage.classList.add("is-error");
      return;
    }
  }
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(ANONYMOUS_SESSION_KEY);
  appShell.hidden = true;
  accessScreen.hidden = false;
  studentEmailField.value = "";
  accessMessage.textContent = "";
  showTab("report");
});

document.querySelectorAll(".filter-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    activeFilter = chip.dataset.filter;
    document.querySelectorAll(".filter-chip").forEach((item) => {
      const selected = item === chip;
      item.classList.toggle("is-selected", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    renderReports();
  });
});

document.querySelector("#migrate-history").addEventListener("click", async () => {
  const message = document.querySelector("#migration-message");
  const consent = document.querySelector("#migration-consent");
  message.textContent = "";
  message.classList.remove("is-error");
  if (!consent.checked) {
    message.textContent = "Confirma primero que los reportes locales son tuyos.";
    message.classList.add("is-error");
    return;
  }
  if (!window.INACloud?.session?.user) {
    message.textContent = "Inicia sesión institucional para importar el historial.";
    message.classList.add("is-error");
    return;
  }

  const button = document.querySelector("#migrate-history");
  button.disabled = true;
  try {
    const reports = await readReports();
    const history = reports.filter((report) => report.syncStatus !== "synced");
    if (!history.length) {
      message.textContent = "No hay reportes locales pendientes de importar.";
      return;
    }
    if (!window.confirm(`Se importarán ${history.length} reportes locales y sus fotos. El servidor los asociará a la cuenta institucional actual. Continúa solo si todos te pertenecen.`)) {
      return;
    }
    for (const report of history) {
      report.id ||= crypto.randomUUID();
      report.anonymousSessionId = window.INACloud.session.user.id;
      report.source = "local_migration";
      report.syncStatus = "pending";
      report.updatedAt = new Date().toISOString();
      await updateLocalReport(report);
    }
    if (navigator.onLine) await syncPendingReports();
    message.textContent = navigator.onLine
      ? "Importación terminada. Las copias locales se conservaron."
      : "Historial en cola local; se sincronizará al recuperar la conexión.";
    await renderReports();
  } catch (error) {
    message.textContent = "No se pudo importar el historial completo. Tus copias locales se conservaron.";
    message.classList.add("is-error");
    console.error("Falló la importación del historial local:", error);
  } finally {
    button.disabled = false;
  }
});

descriptionField.addEventListener("input", () => {
  characterCount.textContent = `${descriptionField.value.length}/500`;
});

async function compressImage(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecciona únicamente archivos de imagen.");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error("Cada foto original debe pesar menos de 10 MB.");
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = sourceUrl;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("No se pudo abrir una de las fotos."));
    });

    const scale = Math.min(1, 1280 / image.naturalWidth, 1280 / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar una foto en este navegador.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let blob;
    for (let quality = 0.8; quality >= 0.4; quality -= 0.1) {
      blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= 700 * 1024) break;
    }
    if (!blob || blob.size > 700 * 1024) {
      throw new Error("No se pudo reducir una foto a un tamaño adecuado. Prueba con otra imagen.");
    }
    return { name: "evidencia.jpg", blob };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function renderPhotoPreviews() {
  for (const url of previewObjectUrls) URL.revokeObjectURL(url);
  previewObjectUrls = [];
  photoPreviewList.replaceChildren();

  selectedPhotos.forEach((photo, index) => {
    const item = createElement("div", "photo-preview");
    const image = document.createElement("img");
    const url = URL.createObjectURL(photo.blob);
    previewObjectUrls.push(url);
    image.src = url;
    image.alt = `Vista previa de la foto ${index + 1}`;
    const remove = createElement("button", "remove-photo", "Quitar");
    remove.type = "button";
    remove.setAttribute("aria-label", `Quitar foto ${index + 1}`);
    remove.addEventListener("click", () => {
      selectedPhotos = selectedPhotos.filter((_, photoIndex) => photoIndex !== index);
      photoInput.value = "";
      renderPhotoPreviews();
    });
    item.append(image, remove);
    photoPreviewList.append(item);
  });
}

photoInput.addEventListener("change", async () => {
  formMessage.textContent = "";
  formMessage.classList.remove("is-error");
  const files = Array.from(photoInput.files || []);
  selectedPhotos = [];
  renderPhotoPreviews();
  if (files.length > MAX_PHOTOS) {
    formMessage.textContent = `Puedes agregar hasta ${MAX_PHOTOS} fotos por reporte.`;
    formMessage.classList.add("is-error");
    photoInput.value = "";
    return;
  }

  try {
    for (const file of files) {
      selectedPhotos.push(await compressImage(file));
    }
    renderPhotoPreviews();
  } catch (error) {
    selectedPhotos = [];
    photoInput.value = "";
    renderPhotoPreviews();
    formMessage.textContent = error.message;
    formMessage.classList.add("is-error");
  }
});

document.querySelector("#suggest-description").addEventListener("click", () => {
  const category = document.querySelector("#category").value;
  const location = document.querySelector("#location").value;
  const severity = form.querySelector('input[name="severity"]:checked')?.value;
  if (!category || !location) {
    formMessage.textContent = "Selecciona primero la categoría y el lugar para crear el borrador.";
    formMessage.classList.add("is-error");
    return;
  }

  const level = severity ? levels[severity].label : "";
  const observation = descriptionField.value.trim();
  const introduction = `Se reporta una situación relacionada con ${category.toLowerCase()} en ${location.toLowerCase()}.`;
  const priority = level ? `Nivel indicado: ${level}.` : "";
  const conclusion = "Solicito revisión y seguimiento.";
  const availableObservationLength = Math.max(
    0,
    500 - introduction.length - priority.length - conclusion.length - 3,
  );
  const observationText = observation
    ? `Observación: ${observation.slice(0, availableObservationLength)}`
    : "Observación: [describe aquí lo que viste].";
  descriptionField.value = [introduction, observationText, priority, conclusion]
    .filter(Boolean)
    .join(" ")
    .slice(0, 500);
  descriptionField.dispatchEvent(new Event("input", { bubbles: true }));
  descriptionField.focus();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formMessage.textContent = "";
  formMessage.classList.remove("is-error");

  const data = new FormData(form);
  const report = {
    id: crypto.randomUUID(),
    category: String(data.get("category") || ""),
    location: String(data.get("location") || ""),
    description: String(data.get("description") || "").trim(),
    severity: String(data.get("severity") || ""),
    anonymousSessionId: getAnonymousSessionId(),
    status: "Recibido",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    syncStatus: window.INACloud?.configured ? "pending" : "local",
    source: "student",
    code: `INA-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    photos: selectedPhotos,
  };

  if (!report.category || !report.location || !report.description || !levels[report.severity]) {
    formMessage.textContent = "Completa todos los campos para enviar tu reporte.";
    formMessage.classList.add("is-error");
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Guardando reporte…";
  try {
    await saveReport(report);
  } catch (error) {
    formMessage.textContent = "No se pudo guardar el reporte en este dispositivo. Revisa el espacio disponible y vuelve a intentarlo.";
    formMessage.classList.add("is-error");
    console.error("No se pudo guardar el reporte:", error);
    return;
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Enviar reporte <span aria-hidden="true">→</span>';
  }

  form.reset();
  selectedPhotos = [];
  renderPhotoPreviews();
  characterCount.textContent = "0/500";
  formMessage.textContent = window.INACloud?.configured
    ? `Reporte ${report.code} guardado localmente; ${navigator.onLine ? "sincronizando…" : "pendiente de sincronización."}`
    : `Reporte ${report.code} guardado en este dispositivo.`;
  if (window.INACloud?.configured && navigator.onLine) await syncPendingReports();
  await renderReports();
  showTab("list");
});

window.setTimeout(() => {
  initializeApplication();
}, 1350);

async function initializeApplication() {
  splashScreen.hidden = true;
  accessScreen.hidden = false;
  if (window.INACloud?.configured) {
    document.querySelector("#access-description").textContent =
      "Acceso institucional verificado por correo. Los docentes solo consultan reportes mediante permisos asignados por el INA.";
    document.querySelector("#access-hint").textContent =
      "Te enviaremos un enlace de un solo uso a tu correo institucional. La cuenta y su membresía deben estar autorizadas por el instituto.";
    document.querySelector("#access-submit").innerHTML = 'Enviar enlace de acceso <span aria-hidden="true">→</span>';
    try {
      await window.INACloud.completeLoginFromUrl();
      const user = await window.INACloud.getCurrentUser();
      if (user) {
        const profile = await window.INACloud.getMyProfile();
        if (profile?.authorized && profile.role === "student") {
          showApp(user.email);
        } else {
          accessMessage.textContent = "La cuenta aún no tiene autorización estudiantil en INA Reporta. Contacta a la administración del instituto.";
          accessMessage.classList.add("is-error");
        }
      }
    } catch (error) {
      accessMessage.textContent = "No se pudo validar la sesión o el acceso institucional. Revisa el enlace y vuelve a intentarlo.";
      accessMessage.classList.add("is-error");
      console.error("Falló la inicialización de sesión segura:", error);
    }
  } else {
    const email = getStudentEmail();
    if (email && INSTITUTIONAL_EMAIL_PATTERN.test(email) && getAnonymousSessionId()) {
      showApp(email);
    }
  }
  updateReportingDate();
  scheduleDayReset();
}

window.addEventListener("online", async () => {
  if (!window.INACloud?.configured || !window.INACloud.session?.user) return;
  await syncPendingReports();
  if (!appShell.hidden && !listPanel.hidden) await renderReports();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    updateReportingDate();
    if (!appShell.hidden && !listPanel.hidden) renderReports();
    scheduleDayReset();
  }
});

window.addEventListener("focus", () => {
  updateReportingDate();
  if (!appShell.hidden && !listPanel.hidden) renderReports();
  scheduleDayReset();
});

window.addEventListener("pagehide", () => {
  window.clearTimeout(dayResetTimer);
});
