(function () {
  "use strict";

  const SESSION_STORAGE_KEY = "ina-reporta.cloud-session.v1";
  const config = window.INA_CLOUD_CONFIG || {};
  const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey && config.institutionId);
  let session = readSession();

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || "null");
    } catch (error) {
      console.error("No se pudo leer la sesión de nube:", error);
      return null;
    }
  }

  function saveSession(value) {
    session = value;
    if (value) localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  function endpoint(path) {
    return `${config.supabaseUrl.replace(/\/+$/, "")}${path}`;
  }

  async function request(path, options, includeSession = true) {
    if (!configured) throw new Error("El servicio de nube todavía no está configurado.");
    const current = session;
    const headers = new Headers(options && options.headers ? options.headers : {});
    headers.set("apikey", config.supabaseAnonKey);
    if (includeSession && current && current.access_token) headers.set("Authorization", `Bearer ${current.access_token}`);
    else headers.set("Authorization", `Bearer ${config.supabaseAnonKey}`);

    let response = await fetch(endpoint(path), { ...options, headers });
    if (response.status === 401 && current && current.refresh_token && !path.startsWith("/auth/v1/")) {
      await refreshSession();
      headers.set("Authorization", `Bearer ${session.access_token}`);
      response = await fetch(endpoint(path), { ...options, headers });
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body && (body.message || body.msg || body.error_description)
        ? body.message || body.msg || body.error_description
        : `Servicio en nube: error ${response.status}.`);
    }
    const body = await response.text();
    return body ? JSON.parse(body) : null;
  }

  async function refreshSession() {
    if (!session || !session.refresh_token) throw new Error("La sesión expiró. Inicia sesión otra vez.");
    const result = await request("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    }, false);
    saveSession(result);
    return result;
  }

  async function sendMagicLink(email, redirectTo) {
    const redirectParameter = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : "";
    await request(`/auth/v1/otp${redirectParameter}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, create_user: false }),
    }, false);
  }

  async function signInAnonymously() {
    if (!configured) throw new Error("El servicio de nube todavía no está configurado.");
    if (session?.access_token) {
      const currentUser = await getCurrentUser();
      if (currentUser.is_anonymous) return currentUser;
      throw new Error("Hay una sesión de personal autorizado activa en este navegador. Cierra esa sesión antes de continuar como estudiante.");
    }
    const result = await request("/auth/v1/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }, false);
    if (!result.access_token || !result.refresh_token || !result.user) {
      throw new Error("Supabase no devolvió una sesión anónima. Revisa que el acceso anónimo esté habilitado.");
    }
    saveSession(result);
    return result.user;
  }

  async function registerAnonymousStudent(accessCode) {
    return rpc("register_anonymous_student", {
      p_institution_id: config.institutionId,
      p_access_code: accessCode,
    });
  }

  async function getLinkedStudents() {
    const rows = await rpc("get_my_linked_students", { p_institution_id: config.institutionId });
    return Array.isArray(rows) ? rows.map((row) => row.student_id) : [];
  }

  async function completeLoginFromUrl() {
    const parameters = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = parameters.get("access_token");
    const refreshToken = parameters.get("refresh_token");
    const errorDescription = parameters.get("error_description");
    if (errorDescription) throw new Error(errorDescription);
    if (!accessToken || !refreshToken) return false;

    saveSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: parameters.get("token_type") || "bearer",
      expires_at: Math.floor(Date.now() / 1000) + Number(parameters.get("expires_in") || 3600),
    });
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    const user = await request("/auth/v1/user", { method: "GET" });
    session.user = user;
    saveSession(session);
    return true;
  }

  async function getCurrentUser() {
    if (!configured || !session) return null;
    if (session.expires_at && session.expires_at < Math.floor(Date.now() / 1000) + 30) await refreshSession();
    const user = await request("/auth/v1/user", { method: "GET" });
    session.user = user;
    saveSession(session);
    return user;
  }

  async function signOut() {
    if (configured && session) {
      try {
        await request("/auth/v1/logout", { method: "POST" });
      } finally {
        saveSession(null);
      }
    } else {
      saveSession(null);
    }
  }

  async function rpc(name, payload) {
    return request(`/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
  }

  async function getProfile() {
    return rpc("get_my_profile", { p_institution_id: config.institutionId });
  }

  async function uploadPhoto(path, blob) {
    return request(`/storage/v1/object/${encodeURIComponent(config.photoBucket)}/${path.split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST",
      headers: {
        "Content-Type": blob.type || "image/jpeg",
        "x-upsert": "true",
      },
      body: blob,
    });
  }

  async function syncReport(report) {
    if (!session?.user?.id) throw new Error("Inicia una sesión institucional antes de sincronizar.");
    const studentId = report.studentId || session.user.id;
    const photoPaths = (report.photos || []).map((photo, index) =>
      `${config.institutionId}/${studentId}/${report.id}/${index + 1}.jpg`,
    );
    const row = {
      id: report.id,
      institution_id: config.institutionId,
      student_id: studentId,
      created_by: session.user.id,
      created_at: report.createdAt,
      updated_at: new Date().toISOString(),
      category: report.category,
      location: report.location,
      description: report.description,
      severity: report.severity,
      status: report.status || "Recibido",
      sync_status: "pending",
      photo_paths: photoPaths,
      source: report.source || "student",
    };
    await request("/rest/v1/reports?on_conflict=id", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify(row),
    });

    for (let index = 0; index < photoPaths.length; index += 1) {
      await uploadPhoto(photoPaths[index], report.photos[index].blob);
    }
    await request(`/rest/v1/reports?id=eq.${encodeURIComponent(report.id)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({ sync_status: "synced", updated_at: new Date().toISOString() }),
    });
    return { ...report, syncStatus: "synced", photoPaths };
  }

  async function listStudentReports(from, to) {
    return rpc("student_list_reports", {
      p_institution_id: config.institutionId,
      p_from: from,
      p_to: to,
      p_limit: 500,
    });
  }

  async function getMyProfile() {
    const profiles = await getProfile();
    return Array.isArray(profiles) ? profiles[0] || null : profiles;
  }

  async function listTeacherReports(filters) {
    return rpc("teacher_list_reports", {
      p_institution_id: config.institutionId,
      p_from: filters.from || null,
      p_to: filters.to || null,
      p_category: filters.category || null,
      p_search: filters.search || null,
      p_student_id: filters.studentId || null,
      p_offset: filters.offset || 0,
      p_limit: filters.limit || 30,
    });
  }

  async function updateReportStatus(reportId, status) {
    return rpc("teacher_update_report_status", {
      p_report_id: reportId,
      p_status: status,
    });
  }

  async function createPhotoUrl(reportId, path) {
    await rpc("audit_report_action", { p_report_id: reportId, p_action: "photo_view" });
    const result = await request(`/storage/v1/object/sign/${encodeURIComponent(config.photoBucket)}/${path.split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 300 }),
    });
    return `${endpoint(result.signedURL.startsWith("/") ? result.signedURL : `/storage/v1${result.signedURL}`)}`;
  }

  window.INACloud = Object.freeze({
    configured,
    get session() { return session; },
    get institutionId() { return config.institutionId; },
    sendMagicLink,
    signInAnonymously,
    registerAnonymousStudent,
    getLinkedStudents,
    completeLoginFromUrl,
    getCurrentUser,
    signOut,
    getProfile,
    getMyProfile,
    syncReport,
    listStudentReports,
    listTeacherReports,
    updateReportStatus,
    createPhotoUrl,
  });
})();
