const STORAGE_KEY = "timo-day-v1";
const AUTH_KEY = "timo-user-v1";
const API_BASE = window.location.protocol === "file:" ? "" : "/api";
const BASE_TITLE = "Timo - Timeboxed Tasks";
const RING_LENGTH = 326.73;
const PIXELS_PER_MINUTE = 1.15;
const TIMELINE_TOP_PADDING = 18;
const TIMELINE_BOTTOM_PADDING = 132;
const TIMELINE_START_MINUTE = 60;
const TIMELINE_END_MINUTE = 12 * 60;
const TIMEBOX_STATUSES = new Set(["active", "review", "done", "paused"]);
const DEFAULT_TAGS = ["Personal", "Work", "Health", "Study", "Idea"];
const USER_ROLES = new Set([
  "Student",
  "Designer",
  "Developer",
  "Product Manager",
  "Marketer",
  "Founder",
  "Freelancer",
  "Teacher",
  "Other",
]);
const LEGACY_TAG_RENAMES = new Map([["admin", "Health"]]);
const PASSWORD_RULE_TEXT = "Use 8+ characters with uppercase, lowercase, number, and special character.";
const TAG_COLORS = new Map([
  ["personal", "#ff7ab6"],
  ["work", "#19d0e8"],
  ["health", "#20a96b"],
  ["study", "#f0b81c"],
  ["idea", "#b79cff"],
]);

const state = loadState();
let sessionUser = null;
let tickId = null;
let draggedTaskId = null;
let didDragTimebox = false;
let pointerDrag = null;
let selectedTaskId = null;
let selectedTimeboxTaskId = null;
let editingTaskId = null;
let taskEditInitialValue = null;
let authMode = "signup";
let completionPanelWasOpen = false;
let isTimerFullView = false;
let serverSyncTimer = null;
let deferredInstallPrompt = null;
let activitySyncTimer = null;
let lastTrackedActivityDate = null;
let isRolePreviewSession = false;

const elements = {
  onboardingModal: document.querySelector("#onboardingModal"),
  onboardingStartButton: document.querySelector("#onboardingStartButton"),
  onboardingCloseButton: document.querySelector("#onboardingCloseButton"),
  installAppButton: document.querySelector("#installAppButton"),
  installStatus: document.querySelector("#installStatus"),
  roleOnboardingModal: document.querySelector("#roleOnboardingModal"),
  roleOptions: document.querySelector("#roleOptions"),
  roleOnboardingStatus: document.querySelector("#roleOnboardingStatus"),
  loginScreen: document.querySelector("#loginScreen"),
  loginForm: document.querySelector("#loginForm"),
  loginButton: document.querySelector("#loginButton"),
  authSwitchButton: document.querySelector("#authSwitchButton"),
  loginGreeting: document.querySelector(".login-greeting"),
  loginNameField: document.querySelector("#loginNameField"),
  loginName: document.querySelector("#loginName"),
  loginEmail: document.querySelector("#loginEmail"),
  loginPassword: document.querySelector("#loginPassword"),
  passwordRuleList: document.querySelector("#passwordRules"),
  passwordRules: document.querySelectorAll("[data-password-rule]"),
  authStatus: document.querySelector("#authStatus"),
  appShell: document.querySelector("#appShell"),
  accountButton: document.querySelector("#accountButton"),
  accountInitial: document.querySelector("#accountInitial"),
  accountModal: document.querySelector("#accountModal"),
  accountCloseButton: document.querySelector("#accountCloseButton"),
  accountName: document.querySelector("#accountName"),
  accountEmail: document.querySelector("#accountEmail"),
  accountRole: document.querySelector("#accountRole"),
  logoutButton: document.querySelector("#logoutButton"),
  deleteAccountButton: document.querySelector("#deleteAccountButton"),
  taskModal: document.querySelector("#taskModal"),
  taskEditForm: document.querySelector("#taskEditForm"),
  taskEditCloseButton: document.querySelector("#taskEditCloseButton"),
  taskEditDate: document.querySelector("#taskEditDate"),
  taskEditName: document.querySelector("#taskEditName"),
  taskEditTag: document.querySelector("#taskEditTag"),
  taskEditMinutes: document.querySelector("#taskEditMinutes"),
  taskEditNote: document.querySelector("#taskEditNote"),
  taskSaveButton: document.querySelector("#taskSaveButton"),
  taskDeleteButton: document.querySelector("#taskDeleteButton"),
  monthYearLabel: document.querySelector("#monthYearLabel"),
  monthProgressLabel: document.querySelector("#monthProgressLabel"),
  capacityInput: document.querySelector("#capacityInput"),
  capacityText: document.querySelector("#capacityText"),
  plannedText: document.querySelector("#plannedText"),
  overloadText: document.querySelector("#overloadText"),
  doneText: document.querySelector("#doneText"),
  actualText: document.querySelector("#actualText"),
  todoAddButton: document.querySelector("#todoAddButton"),
  taskForm: document.querySelector("#taskForm"),
  taskTooltabCloseButton: document.querySelector("#taskTooltabCloseButton"),
  taskName: document.querySelector("#taskName"),
  taskTag: document.querySelector("#taskTag"),
  tagOptions: document.querySelector("#tagOptions"),
  taskMinutes: document.querySelector("#taskMinutes"),
  taskList: document.querySelector("#taskList"),
  taskTemplate: document.querySelector("#taskTemplate"),
  activeTaskName: document.querySelector("#activeTaskName"),
  timerState: document.querySelector("#timerState"),
  timerText: document.querySelector("#timerText"),
  ringProgress: document.querySelector("#ringProgress"),
  pauseResumeButton: document.querySelector("#pauseResumeButton"),
  stopButton: document.querySelector("#stopButton"),
  timerFullViewButton: document.querySelector("#timerFullViewButton"),
  timerFullViewCloseButton: document.querySelector("#timerFullViewCloseButton"),
  completionPanel: document.querySelector("#completionPanel"),
  extensionMinutes: document.querySelector("#extensionMinutes"),
  finishDayButton: document.querySelector("#finishDayButton"),
  resetDayButton: document.querySelector("#resetDayButton"),
  hideReportButton: document.querySelector("#hideReportButton"),
  reportPanel: document.querySelector("#reportPanel"),
  reportTime: document.querySelector("#reportTime"),
  reportDone: document.querySelector("#reportDone"),
  reportOverruns: document.querySelector("#reportOverruns"),
  reportBars: document.querySelector("#reportBars"),
  focusTabs: document.querySelector(".focus-tabs"),
  tabButtons: document.querySelectorAll(".tab-button"),
  timeboxPanel: document.querySelector("#timeboxPanel"),
  timerCard: document.querySelector("#timerCard"),
  timeboxMeta: document.querySelector("#timeboxMeta"),
  selectedDateLabel: document.querySelector("#selectedDateLabel"),
  prevDateButton: document.querySelector("#prevDateButton"),
  nextDateButton: document.querySelector("#nextDateButton"),
  timeAxis: document.querySelector("#timeAxis"),
  timeboxTrack: document.querySelector("#timeboxTrack"),
};

elements.capacityInput.value = state.capacityHours;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallButtonState();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  setInstallStatus("Timo has been installed.");
  updateInstallButtonState();
});

initAuthView();

elements.onboardingStartButton.addEventListener("click", () => {
  setAuthMode("signup");
  showLogin();
});

elements.onboardingCloseButton.addEventListener("click", () => {
  hideOnboarding();
});

elements.onboardingModal.addEventListener("click", (event) => {
  if (event.target === elements.onboardingModal) {
    hideOnboarding();
  }
});

elements.installAppButton.addEventListener("click", () => {
  installPwaApp();
});

elements.roleOptions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-role]");
  if (!button) return;
  saveUserRole(button.dataset.role);
});

elements.loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loginTimo();
});

elements.loginButton.addEventListener("click", () => {
  loginTimo();
});

elements.authSwitchButton.addEventListener("click", () => {
  setAuthMode(elements.authSwitchButton.dataset.authMode);
});

["input", "keyup", "change"].forEach((eventName) => {
  elements.loginPassword.addEventListener(eventName, () => {
    updatePasswordRuleList(elements.loginPassword.value);
    elements.loginPassword.setCustomValidity("");
  });
});

elements.loginScreen.addEventListener("click", (event) => {
  if (event.target === elements.loginScreen) {
    elements.loginScreen.classList.add("is-hidden");
    if (!getCurrentUser()) showOnboarding();
  }
});

async function loginTimo() {
  const name = elements.loginName.value.trim();
  const email = elements.loginEmail.value.trim();
  const password = elements.loginPassword.value;
  elements.loginPassword.setCustomValidity("");
  updatePasswordRuleList(password);
  if ((authMode === "signup" && !name) || !email || !password) {
    elements.loginForm.reportValidity();
    return;
  }
  if (authMode === "signup") {
    const passwordError = getPasswordRuleError(password);
    if (passwordError) {
      elements.loginPassword.setCustomValidity(passwordError);
      elements.loginForm.reportValidity();
      elements.authStatus.textContent = passwordError;
      return;
    }
  }

  elements.loginButton.disabled = true;
  elements.authStatus.textContent = authMode === "signup" ? "Checking email verification..." : "Signing in...";

  let authResult;
  try {
    authResult =
      authMode === "signup"
        ? await requestSignupEmailVerification({ name, email, password })
        : await requestExistingAccountLogin({ email, password });
  } catch (error) {
    elements.authStatus.textContent = getAuthDisplayMessage(error.message);
    elements.loginButton.disabled = false;
    return;
  }

  if (!authResult.verified) {
    elements.authStatus.textContent =
      authResult.message ||
      (authMode === "signup" ? "Verify your email to finish creating your account." : "Check your email and password.");
    elements.loginButton.disabled = false;
    return;
  }

  sessionUser = {
    name: authResult.name || name || email.split("@")[0],
    email: authResult.email || email,
    emailVerified: authResult.verified,
    role: authResult.role || "",
    token: authResult.token,
    refreshToken: authResult.refreshToken,
    expiresAt: authResult.expiresAt,
    loggedInAt: new Date().toISOString(),
  };
  storeSessionUser(sessionUser);
  elements.loginPassword.value = "";
  elements.authStatus.textContent = "";
  elements.loginButton.disabled = false;
  await hydrateStateFromServer();
  showApp();
}

window.loginTimo = loginTimo;

function setAuthMode(mode) {
  authMode = mode === "login" ? "login" : "signup";
  const isLogin = authMode === "login";
  elements.loginForm.classList.toggle("is-login-mode", isLogin);
  elements.loginForm.classList.toggle("is-signup-mode", !isLogin);
  elements.authSwitchButton.dataset.authMode = isLogin ? "signup" : "login";
  elements.authSwitchButton.textContent = isLogin ? "Create account" : "Log in";
  elements.authSwitchButton.setAttribute("aria-label", isLogin ? "Switch to create account" : "Switch to log in");
  elements.loginGreeting.textContent = isLogin ? "Welcome back" : "Welcome";
  elements.loginNameField.classList.toggle("is-hidden", isLogin);
  elements.loginName.required = !isLogin;
  elements.loginPassword.autocomplete = isLogin ? "current-password" : "new-password";
  elements.loginPassword.placeholder = isLogin ? "Password" : PASSWORD_RULE_TEXT;
  elements.loginPassword.minLength = isLogin ? 1 : 8;
  elements.loginPassword.setCustomValidity("");
  elements.passwordRuleList.classList.toggle("is-hidden", isLogin);
  updatePasswordRuleList(elements.loginPassword.value);
  elements.loginButton.textContent = isLogin ? "Log in" : "Create account";
  elements.authStatus.textContent = "";
}

function getPasswordRuleError(password) {
  const rules = getPasswordRuleStates(password);
  if (!rules.maxLength) return "Use a password with 64 characters or fewer.";
  if (!rules.length) return PASSWORD_RULE_TEXT;
  if (!rules.lowercase || !rules.uppercase || !rules.number || !rules.special) return PASSWORD_RULE_TEXT;
  return "";
}

function getPasswordRuleStates(password) {
  return {
    length: password.length >= 8 && password.length <= 64,
    lowercase: hasLowercaseLetter(password),
    uppercase: hasUppercaseLetter(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
    maxLength: password.length <= 64,
  };
}

function hasLowercaseLetter(value) {
  return /[a-z]/.test(value);
}

function hasUppercaseLetter(value) {
  return /[A-Z]/.test(value);
}

function updatePasswordRuleList(password) {
  const rules = getPasswordRuleStates(password);
  elements.passwordRules.forEach((rule) => {
    rule.classList.toggle("is-met", Boolean(rules[rule.dataset.passwordRule]));
  });
}

window.updatePasswordChecklist = () => {
  updatePasswordRuleList(elements.loginPassword.value);
};

async function requestSignupEmailVerification(signup) {
  if (API_BASE) {
    const data = await apiRequest("/auth/signup", {
      method: "POST",
      body: signup,
      auth: false,
    });
    return normalizeAuthResponse(data);
  }

  return {
    verified: true,
    email: signup.email,
    name: signup.name,
    mode: "demo",
  };
}

async function requestExistingAccountLogin(credentials) {
  if (API_BASE) {
    const data = await apiRequest("/auth/login", {
      method: "POST",
      body: credentials,
      auth: false,
    });
    return normalizeAuthResponse(data);
  }

  return {
    verified: true,
    email: credentials.email,
    mode: "demo",
  };
}

function normalizeAuthResponse(data) {
  const verificationMessage =
    data.requiresEmailVerification && data.verificationUrl
      ? `${data.message} Development verification link: ${data.verificationUrl}`
      : data.message;

  return {
    verified: Boolean(data.user?.emailVerified),
    name: data.user?.name,
    email: data.user?.email,
    role: data.user?.role || data.user?.profession || "",
    token: data.token,
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt,
    message: verificationMessage,
  };
}

async function hydrateUserProfile() {
  if (!API_BASE || !getCurrentUser()?.token) return;

  try {
    const data = await apiRequest("/me");
    const current = getCurrentUser();
    if (!data.user || !current) return;
    sessionUser = {
      ...current,
      ...data.user,
      token: current.token,
      refreshToken: current.refreshToken,
      expiresAt: current.expiresAt,
    };
    storeSessionUser(sessionUser);
  } catch {}
}

function getAuthDisplayMessage(message) {
  const raw = String(message || "").trim();
  const waitSeconds = getAuthWaitSeconds(raw);
  if (waitSeconds) return `Please wait ${waitSeconds} seconds before requesting another verification email.`;
  if (/invalid.*(login|credential|password)|email or password/i.test(raw)) return "The password is incorrect.";
  if (/role|profession|schema cache|column/i.test(raw)) return "Unable to save role right now. Please try again later.";
  return raw || "Unable to connect to the server.";
}

function getAuthWaitSeconds(message) {
  const match = message.match(/after\s+(\d+)\s*seconds?/i);
  if (match) return Number(match[1]);
  return /security purposes|too many requests|rate limit/i.test(message) ? 60 : null;
}

async function apiRequest(path, options = {}) {
  return apiRequestWithRetry(path, options, true);
}

async function apiRequestWithRetry(path, options = {}, allowRefresh = true) {
  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.activityDate ? { "X-Timo-Activity-Date": options.activityDate } : {}),
  };

  if (options.auth !== false) {
    const token = getCurrentUser()?.token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));

  if (response.status === 401 && options.auth !== false && allowRefresh && (await refreshCurrentSession())) {
    return apiRequestWithRetry(path, options, false);
  }

  if (!response.ok) {
    throw new Error(data.error || "Server request failed.");
  }

  return data;
}

async function refreshCurrentSession() {
  const current = getCurrentUser();
  if (!API_BASE || !current?.refreshToken) {
    clearSessionUser();
    return false;
  }

  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken: current.refreshToken }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    clearSessionUser();
    return false;
  }

  const refreshed = normalizeAuthResponse(data);
  if (!refreshed.verified || !refreshed.token) {
    clearSessionUser();
    return false;
  }

  sessionUser = {
    ...current,
    name: refreshed.name || current.name,
    email: refreshed.email || current.email,
    emailVerified: refreshed.verified,
    role: refreshed.role || refreshed.profession || current.role || current.profession || "",
    token: refreshed.token,
    refreshToken: refreshed.refreshToken || current.refreshToken,
    expiresAt: refreshed.expiresAt,
  };
  storeSessionUser(sessionUser);
  return true;
}

elements.accountButton.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  openAccountModal();
});

elements.accountCloseButton.addEventListener("click", () => {
  closeAccountModal();
});

elements.accountModal.addEventListener("click", (event) => {
  if (event.target === elements.accountModal) closeAccountModal();
});

document.addEventListener("click", (event) => {
  const accountButton = event.target.closest("#accountButton");
  if (!accountButton) return;
  event.preventDefault();
  openAccountModal();
}, true);

elements.logoutButton.addEventListener("click", async () => {
  await logoutServerSession();
  clearSessionUser();
  stopTicker();
  closeAccountModal();
  showApp();
});

elements.deleteAccountButton.addEventListener("click", async () => {
  if (!confirm("Delete this account and clear local tasks?")) return;
  await deleteLocalAccount();
});

elements.taskEditForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (elements.taskSaveButton.disabled) return;
  saveTaskEdit();
});

elements.taskEditForm.addEventListener("input", updateTaskSaveButton);
elements.taskEditForm.addEventListener("change", updateTaskSaveButton);

elements.taskEditCloseButton.addEventListener("click", () => {
  closeTaskModal();
});

elements.taskDeleteButton.addEventListener("click", () => {
  if (!editingTaskId) return;
  deleteTask(editingTaskId);
  closeTaskModal();
});

elements.taskModal.addEventListener("click", (event) => {
  if (event.target === elements.taskModal) closeTaskModal();
});

elements.taskList.addEventListener("click", (event) => {
  const taskItem = event.target.closest(".task-item");
  if (!taskItem || event.target.closest(".task-check, .task-actions, button")) return;
  event.preventDefault();
  openTaskModal(taskItem.dataset.taskId);
});

elements.taskList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const taskItem = event.target.closest(".task-item");
  if (!taskItem) return;
  event.preventDefault();
  openTaskModal(taskItem.dataset.taskId);
});

elements.todoAddButton.addEventListener("click", () => {
  toggleTaskTooltab();
});

elements.taskTooltabCloseButton.addEventListener("click", () => {
  closeTaskTooltab();
});

elements.taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = elements.taskName.value.trim();
  if (!name) return;
  const tag = normalizeTag(elements.taskTag.value);

  state.tasks.push({
    id: crypto.randomUUID(),
    name,
    tag,
    estimateMinutes: Number(elements.taskMinutes.value),
    note: "",
    order: getNextTaskOrder(),
    priority: "medium",
    actualSeconds: 0,
    status: "pending",
    extensions: 0,
  });

  elements.taskForm.reset();
  elements.taskTag.value = "";
  elements.taskMinutes.value = "30";
  saveAndRender();
  elements.taskName.focus();
});

elements.capacityInput.addEventListener("change", () => {
  state.capacityHours = Number(elements.capacityInput.value || 1);
  saveAndRender();
});

elements.pauseResumeButton.addEventListener("click", () => {
  if (!state.active) return;
  if (state.active.isPaused) {
    state.active.isPaused = false;
    state.active.startedAt = Date.now();
    elements.pauseResumeButton.textContent = "Pause";
    startTicker();
  } else {
    settleElapsed();
    state.active.isPaused = true;
    elements.pauseResumeButton.textContent = "Resume";
    stopTicker();
  }
  saveAndRender();
});

elements.stopButton.addEventListener("click", () => {
  if (!confirm("Do you want to stop this timebox?")) return;
  finishActiveBox(false, "done");
});

elements.timerFullViewButton.addEventListener("click", () => {
  setTimerFullView(!isTimerFullView);
});

elements.timerFullViewCloseButton.addEventListener("click", () => {
  setTimerFullView(false);
});

elements.completionPanel.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const { task, date } = getReviewTask(state.pendingReviewTaskId);
  if (!task) return;

  if (action === "complete") {
    task.status = "done";
    clearPendingReview(date);
  }

  if (action === "extend") {
    const extensionMinutes = Number(elements.extensionMinutes.value || 10);
    task.extensions += 1;
    clearPendingReview(date);
    if (date !== state.date) {
      switchToDate(date);
    }
    startTask(task.id, extensionMinutes);
    return;
  }

  if (action === "pause") {
    task.status = task.actualSeconds > 0 ? "paused" : "pending";
    clearPendingReview(date);
  }

  saveAndRender();
});

elements.finishDayButton.addEventListener("click", () => {
  state.showReport = true;
  saveAndRender();
});

elements.hideReportButton.addEventListener("click", () => {
  state.showReport = false;
  saveAndRender();
});

elements.prevDateButton.addEventListener("click", () => {
  switchDate(-1);
});

elements.nextDateButton.addEventListener("click", () => {
  switchDate(1);
});

elements.resetDayButton?.addEventListener("click", () => {
  const hasData = state.tasks.length > 0 || state.active || state.pendingReviewTaskId;
  if (!hasData || confirm("Clear today’s tasks and time records?")) {
    state.tasks = [];
    state.active = null;
    state.pendingReviewTaskId = null;
    state.showReport = false;
    stopTicker();
    saveAndRender();
  }
});

elements.focusTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-view]");
  if (!button) return;
  state.activeView = button.dataset.view;
  saveAndRender();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (isTimerFullView) {
      setTimerFullView(false);
      return;
    }
    closeTaskModal();
    closeAccountModal();
    closeTaskTooltab();
    return;
  }

  const isEditable = event.target.closest("input, select, textarea");
  if (isEditable) return;

  if (event.key === "Backspace" || event.key === "Delete") {
    if (selectedTimeboxTaskId && (state.activeView || "timebox") === "timebox") {
      event.preventDefault();
      deleteTimeboxRecord(selectedTimeboxTaskId);
      return;
    }

    if (!selectedTaskId) return;
    event.preventDefault();
    deleteTask(selectedTaskId);
  }

  if (event.key === "Enter" && !state.active) {
    const task = getTask(selectedTaskId);
    if (task && task.status !== "done") startTask(task.id);
  }
});

function loadState() {
  const today = getLocalDateKey();
  const storedUser = getStoredSessionUser();

  if (!storedUser) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}

    const demoState = createDemoDayState(today);
    return {
      ...demoState,
      __days: {},
    };
  }

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.version === 2 && saved.days && typeof saved.days === "object") {
      const selectedDate = saved.selectedDate || today;
      const active = getActiveFromDays(saved.days);
      return {
        ...normalizeDayState(selectedDate, saved.days[selectedDate]),
        active: active || normalizeDayState(selectedDate, saved.days[selectedDate]).active,
        __days: saved.days,
      };
    }

    if (saved && Array.isArray(saved.tasks)) {
      const date = saved.date || today;
      const dayState = normalizeDayState(date, saved);
      return {
        ...dayState,
        __days: {
          [date]: getPersistableDayState(dayState),
        },
      };
    }
  } catch {
    const demoState = createDemoDayState(today);
    return {
      ...demoState,
      __days: {},
    };
  }

  const demoState = createDemoDayState(today);
  return {
    ...demoState,
    __days: {},
  };
}

function createDayState(date) {
  return {
    date,
    capacityHours: 6,
    tasks: [],
    active: null,
    pendingReviewTaskId: null,
    showReport: false,
    activeView: "timebox",
    customTags: [],
  };
}

function createDemoDayState(date) {
  return {
    ...createDayState(date),
    tasks: [
      {
        id: "demo-planning",
        name: "Plan the product launch",
        tag: "Work",
        estimateMinutes: 45,
        note: "Draft the key milestones before the team sync.",
        order: 0,
        priority: "high",
        actualSeconds: 42 * 60,
        status: "done",
        extensions: 0,
        timeboxOrder: 0,
        timeboxStartMinute: 9 * 60,
      },
      {
        id: "demo-study",
        name: "Review design references",
        tag: "Study",
        estimateMinutes: 30,
        note: "Collect UI examples for the timebox flow.",
        order: 1,
        priority: "medium",
        actualSeconds: 28 * 60,
        status: "paused",
        extensions: 0,
      },
      {
        id: "demo-admin",
        name: "Clear inbox follow-ups",
        tag: "Health",
        estimateMinutes: 15,
        note: "",
        order: 2,
        priority: "low",
        actualSeconds: 8 * 60,
        status: "review",
        extensions: 0,
      },
    ],
  };
}

function normalizeDayState(date, dayState = {}) {
  return {
    ...createDayState(date),
    ...dayState,
    date,
    capacityHours: Number(dayState.capacityHours || 6),
    tasks: Array.isArray(dayState.tasks) ? dayState.tasks.map(normalizeTaskTags) : [],
    active: dayState.active ? { ...dayState.active, date: dayState.active.date || date } : null,
    pendingReviewTaskId: dayState.pendingReviewTaskId || null,
    showReport: Boolean(dayState.showReport),
    activeView: dayState.activeView || "timebox",
    customTags: [],
  };
}

function getPersistableDayState(dayState) {
  return {
    date: dayState.date,
    capacityHours: dayState.capacityHours,
    tasks: dayState.tasks,
    active: dayState.active,
    pendingReviewTaskId: dayState.pendingReviewTaskId,
    showReport: dayState.showReport,
    activeView: dayState.activeView,
    customTags: dayState.customTags || [],
  };
}

async function initAuthView() {
  await consumeAuthRedirectHash();
  enableRoleOnboardingPreview();
  getCurrentUser();
  if (!isRolePreviewSession) {
    await hydrateUserProfile();
    await hydrateStateFromServer();
  }
  showApp();
}

function enableRoleOnboardingPreview() {
  if (!isRoleOnboardingPreviewRequest()) return;

  isRolePreviewSession = true;
  sessionUser = {
    name: "Preview User",
    email: "preview@timo.local",
    emailVerified: true,
    token: "role-preview",
    refreshToken: "",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    loggedInAt: new Date().toISOString(),
    role: "",
  };
}

function isRoleOnboardingPreviewRequest() {
  const params = new URLSearchParams(window.location.search);
  const isPreviewHost = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
  return isPreviewHost && (params.has("role-onboarding") || params.has("profession-onboarding"));
}

async function consumeAuthRedirectHash() {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  if (!hash) return;

  const params = new URLSearchParams(hash);
  const token = params.get("access_token");
  const refreshToken = params.get("refresh_token") || "";
  if (!token) return;

  const expiresAt = getAuthHashExpiresAt(params);
  window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
  sessionUser = {
    token,
    refreshToken,
    expiresAt,
    loggedInAt: new Date().toISOString(),
  };

  try {
    const data = await apiRequest("/me");
    sessionUser = {
      ...data.user,
      token,
      refreshToken,
      expiresAt,
      loggedInAt: new Date().toISOString(),
    };
    storeSessionUser(sessionUser);
  } catch {
    clearSessionUser();
  }
}

function getAuthHashExpiresAt(params) {
  const expiresAt = Number(params.get("expires_at"));
  if (Number.isFinite(expiresAt) && expiresAt > 0) return new Date(expiresAt * 1000).toISOString();
  const expiresIn = Number(params.get("expires_in"));
  if (Number.isFinite(expiresIn) && expiresIn > 0) return new Date(Date.now() + expiresIn * 1000).toISOString();
  return null;
}

function getStoredSessionUser() {
  try {
    const user = JSON.parse(localStorage.getItem(AUTH_KEY));
    if (!user || (isSessionExpired(user) && !user.refreshToken)) return null;
    return user;
  } catch {
    return null;
  }
}

function getCurrentUser() {
  if (sessionUser && !isSessionExpired(sessionUser)) return sessionUser;
  if (sessionUser?.refreshToken) return sessionUser;
  if (sessionUser) sessionUser = null;
  try {
    sessionUser = JSON.parse(localStorage.getItem(AUTH_KEY));
    if (isSessionExpired(sessionUser) && !sessionUser?.refreshToken) {
      sessionUser = null;
      localStorage.removeItem(AUTH_KEY);
    }
    return sessionUser;
  } catch {
    return null;
  }
}

function storeSessionUser(user) {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  } catch {
    // File previews or privacy settings can block storage; keep the session in memory.
  }
}

function clearSessionUser() {
  sessionUser = null;
  lastTrackedActivityDate = null;
  window.clearTimeout(activitySyncTimer);
  try {
    localStorage.removeItem(AUTH_KEY);
  } catch {}
}

function isSessionExpired(user) {
  if (!user?.expiresAt) return false;
  return new Date(user.expiresAt).getTime() <= Date.now();
}

function showApp() {
  elements.loginScreen.classList.add("is-hidden");
  elements.appShell.classList.remove("is-hidden");
  renderAccountButton();
  closeAccountModal();
  if (getCurrentUser()) {
    hideOnboarding();
    trackDailyActivity();
    showRoleOnboardingIfNeeded();
  } else {
    hideRoleOnboarding();
    showOnboarding();
  }
}

function showLogin() {
  hideOnboarding();
  hideRoleOnboarding();
  elements.loginScreen.classList.remove("is-hidden");
  document.title = BASE_TITLE;
  requestAnimationFrame(() => elements.loginName.focus());
}

function showOnboarding() {
  if (getCurrentUser()) return;
  elements.onboardingModal.classList.remove("is-hidden");
  setInstallStatus("");
  updateInstallButtonState();
}

function hideOnboarding() {
  elements.onboardingModal.classList.add("is-hidden");
}

function showRoleOnboardingIfNeeded() {
  const user = getCurrentUser();
  if (!user || (!isRolePreviewSession && (user.role || user.profession))) {
    hideRoleOnboarding();
    return;
  }

  elements.roleOnboardingStatus.textContent = "";
  elements.roleOnboardingModal.classList.remove("is-hidden");
}

function hideRoleOnboarding() {
  elements.roleOnboardingModal.classList.add("is-hidden");
}

function toggleTaskTooltab() {
  if (elements.taskForm.classList.contains("is-hidden")) {
    openTaskTooltab();
    return;
  }

  closeTaskTooltab();
}

function openTaskTooltab() {
  elements.taskForm.classList.remove("is-hidden");
  elements.taskForm.setAttribute("aria-hidden", "false");
  elements.todoAddButton.setAttribute("aria-expanded", "true");
  requestAnimationFrame(() => elements.taskName.focus());
}

function closeTaskTooltab() {
  elements.taskForm.classList.add("is-hidden");
  elements.taskForm.setAttribute("aria-hidden", "true");
  elements.todoAddButton.setAttribute("aria-expanded", "false");
}

async function saveUserRole(role) {
  if (!USER_ROLES.has(role)) return;

  const buttons = elements.roleOptions.querySelectorAll("button");
  buttons.forEach((button) => {
    button.disabled = true;
    button.classList.toggle("is-selected", button.dataset.role === role);
  });
  elements.roleOnboardingStatus.textContent = "Saving...";

  if (isRolePreviewSession) {
    sessionUser = {
      ...getCurrentUser(),
      role,
    };
    renderAccountButton();
    hideRoleOnboarding();
    return;
  }

  try {
    const data = await apiRequest("/me", {
      method: "PATCH",
      body: { role },
    });
    const current = getCurrentUser();
    sessionUser = {
      ...current,
      ...data.user,
      role: data.user?.role || role,
      token: current?.token,
      refreshToken: current?.refreshToken,
      expiresAt: current?.expiresAt,
    };
    storeSessionUser(sessionUser);
    renderAccountButton();
    hideRoleOnboarding();
  } catch (error) {
    elements.roleOnboardingStatus.textContent = getAuthDisplayMessage(error.message);
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
}

async function installPwaApp() {
  if (isStandaloneApp()) {
    setInstallStatus("Timo is already running as an installed app.");
    updateInstallButtonState();
    return;
  }

  if (!deferredInstallPrompt) {
    setInstallStatus("If the install prompt does not appear, use your browser menu to install the app.");
    return;
  }

  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  elements.installAppButton.disabled = true;
  try {
    promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setInstallStatus(choice?.outcome === "accepted" ? "Installation started." : "Installation was canceled.");
  } catch {
    setInstallStatus("Installation cannot start right now. Please try again later.");
  } finally {
    updateInstallButtonState();
  }
}

function updateInstallButtonState() {
  elements.installAppButton.disabled = isStandaloneApp();
}

function setInstallStatus(message) {
  elements.installStatus.textContent = message;
}

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function openAccountModal() {
  const user = getCurrentUser();
  if (!user) {
    showLogin();
    return;
  }

  elements.accountName.textContent = user.name || "-";
  elements.accountEmail.textContent = user.email || "-";
  elements.accountRole.textContent = user.role || user.profession || "-";
  elements.accountModal.classList.remove("is-hidden");
  elements.accountModal.style.display = "grid";
  elements.accountCloseButton.focus();
}

function closeAccountModal() {
  elements.accountModal.classList.add("is-hidden");
  elements.accountModal.style.display = "";
}

window.openAccountModal = openAccountModal;
window.closeAccountModal = closeAccountModal;

function renderAccountButton() {
  const user = getCurrentUser();
  const initial = getUserInitial(user);
  elements.accountInitial.textContent = initial;
  elements.accountButton.classList.toggle("is-logged-in", Boolean(initial));
}

function getUserInitial(user) {
  const name = (user?.name || "").trim();
  return name ? [...name][0].toUpperCase() : "";
}

async function deleteLocalAccount() {
  await deleteServerAccount();
  clearSessionUser();
  stopTicker();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}

  const nextState = {
    ...createDemoDayState(getLocalDateKey()),
    __days: {},
  };
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, nextState);
  selectedTaskId = null;
  selectedTimeboxTaskId = null;
  editingTaskId = null;
  taskEditInitialValue = null;
  closeTaskModal();
  closeAccountModal();
  elements.capacityInput.value = state.capacityHours;
  showApp();
  saveAndRender();
}

function saveAndRender() {
  ensureTaskOrder();
  ensureTimeboxOrder();
  persistState();
  render();
}

function persistState() {
  const days = state.__days && typeof state.__days === "object" ? { ...state.__days } : {};
  const currentDayState = getPersistableDayState(state);
  if (state.active?.date && state.active.date !== state.date) {
    currentDayState.active = null;
  }
  days[state.date] = currentDayState;
  if (state.active?.date && days[state.active.date]) {
    days[state.active.date] = {
      ...days[state.active.date],
      active: state.active,
    };
  }
  state.__days = days;
  const snapshot = {
    version: 2,
    selectedDate: state.date,
    days,
  };

  if (!getCurrentUser()) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Keep the in-memory state usable when browser storage is unavailable.
  }
  queueServerStateSync(snapshot);
}

async function hydrateStateFromServer() {
  if (!API_BASE || !getCurrentUser()?.token) return;

  try {
    const data = await apiRequest("/state", { activityDate: getLocalDateKey() });
    if (data.state?.version === 2 && data.state.days) {
      applyPersistedState(data.state);
      return;
    }

    queueServerStateSync(getPersistedStateSnapshot(), 0);
  } catch {
    // Keep the local copy usable when the server is offline or the token expired.
  }
}

function applyPersistedState(snapshot) {
  const today = getLocalDateKey();
  const selectedDate = snapshot.selectedDate || today;
  const active = getActiveFromDays(snapshot.days);
  const nextState = {
    ...normalizeDayState(selectedDate, snapshot.days[selectedDate]),
    active: active || normalizeDayState(selectedDate, snapshot.days[selectedDate]).active,
    __days: snapshot.days,
  };
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, nextState);
  elements.capacityInput.value = state.capacityHours;
  if (state.active && !state.active.isPaused) startTicker();
  render();
}

function getActiveFromDays(days) {
  for (const [date, day] of Object.entries(days || {})) {
    if (day?.active) return { ...day.active, date: day.active.date || date };
  }
  return null;
}

function getPersistedStateSnapshot() {
  const days = state.__days && typeof state.__days === "object" ? { ...state.__days } : {};
  const currentDayState = getPersistableDayState(state);
  if (state.active?.date && state.active.date !== state.date) {
    currentDayState.active = null;
  }
  days[state.date] = currentDayState;
  if (state.active?.date && days[state.active.date]) {
    days[state.active.date] = {
      ...days[state.active.date],
      active: state.active,
    };
  }
  return {
    version: 2,
    selectedDate: state.date,
    days,
  };
}

function queueServerStateSync(snapshot, delay = 500) {
  if (!API_BASE || !getCurrentUser()?.token) return;
  window.clearTimeout(serverSyncTimer);
  serverSyncTimer = window.setTimeout(() => {
    apiRequest("/state", {
      method: "PUT",
      body: { state: snapshot, activityDate: getLocalDateKey() },
    }).catch(() => {});
  }, delay);
}

function trackDailyActivity(delay = 0) {
  if (isRolePreviewSession) return;
  if (!API_BASE || !getCurrentUser()?.token) return;
  const activityDate = getLocalDateKey();
  if (lastTrackedActivityDate === activityDate) return;
  lastTrackedActivityDate = activityDate;
  window.clearTimeout(activitySyncTimer);
  activitySyncTimer = window.setTimeout(() => {
    apiRequest("/activity", {
      method: "POST",
      body: { activityDate },
    }).catch(() => {
      lastTrackedActivityDate = null;
    });
  }, delay);
}

async function deleteServerAccount() {
  if (!API_BASE || !getCurrentUser()?.token) return;
  await apiRequest("/account", { method: "DELETE" }).catch(() => {});
}

async function logoutServerSession() {
  if (!API_BASE || !getCurrentUser()?.token) return;
  await apiRequest("/auth/logout", { method: "POST" }).catch(() => {});
}

function switchDate(offsetDays) {
  switchToDate(addDaysToDateKey(state.date, offsetDays));
}

function switchToDate(date) {
  if (state.date === date) return;
  if (state.active && !state.active.isPaused) {
    settleElapsed();
  }
  const activeSession = state.active ? { ...state.active } : null;
  persistState();
  const days = state.__days && typeof state.__days === "object" ? state.__days : {};
  const nextState = normalizeDayState(date, days[date]);
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, nextState, { __days: days, active: activeSession || nextState.active });
  selectedTaskId = null;
  selectedTimeboxTaskId = null;
  editingTaskId = null;
  taskEditInitialValue = null;
  closeTaskModal();
  closeAccountModal();
  elements.capacityInput.value = state.capacityHours;
  if (state.active && !state.active.isPaused) startTicker();
  saveAndRender();
}

function getTask(id) {
  return state.tasks.find((task) => task.id === id);
}

function getTaskFromDay(date, id) {
  if (date === state.date) return getTask(id);
  const day = state.__days?.[date];
  return day?.tasks?.find((task) => task.id === id) || null;
}

function getActiveTask() {
  if (!state.active) return null;
  return getTaskFromDay(state.active.date || state.date, state.active.taskId);
}

function getReviewTask(id) {
  const currentTask = getTask(id);
  if (currentTask) return { task: currentTask, date: state.date };
  for (const [date, day] of Object.entries(state.__days || {})) {
    const task = day?.tasks?.find((candidate) => candidate.id === id);
    if (task) return { task, date };
  }
  return { task: null, date: state.date };
}

function clearPendingReview(date) {
  state.pendingReviewTaskId = null;
  if (state.__days?.[date]) {
    state.__days[date] = {
      ...state.__days[date],
      pendingReviewTaskId: null,
    };
  }
}

function startTask(id, overrideMinutes) {
  const task = getTask(id);
  if (!task) return;

  if (state.active) finishActiveBox();

  const now = Date.now();
  state.pendingReviewTaskId = null;
  state.activeView = "timer";
  if (!isTimeboxedTask(task)) task.timeboxOrder = getNextTimeboxOrder();
  if (!Number.isFinite(task.timeboxStartAt)) task.timeboxStartAt = now;
  task.status = "active";
  state.active = {
    taskId: id,
    date: state.date,
    totalSeconds: (overrideMinutes || task.estimateMinutes) * 60,
    remainingSeconds: (overrideMinutes || task.estimateMinutes) * 60,
    startedAt: now,
    isPaused: false,
  };

  requestNotificationPermission();
  startTicker();
  saveAndRender();
}

function startTicker() {
  stopTicker();
  tickId = window.setInterval(updateActiveTimer, 500);
}

function stopTicker() {
  if (tickId) {
    window.clearInterval(tickId);
    tickId = null;
  }
}

function settleElapsed() {
  if (!state.active || state.active.isPaused) return;
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - state.active.startedAt) / 1000));
  if (elapsedSeconds === 0) return;

  const task = getActiveTask();
  if (task) task.actualSeconds += elapsedSeconds;
  state.active.remainingSeconds = Math.max(0, state.active.remainingSeconds - elapsedSeconds);
  state.active.startedAt = Date.now();
}

function updateActiveTimer() {
  if (!state.active || state.active.isPaused) return;
  settleElapsed();
  if (state.active.remainingSeconds <= 0) {
    finishActiveBox(true);
    return;
  }
  if (getCurrentUser()) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistedStateSnapshot()));
    } catch {}
  }
  renderTimeboxes();
  renderTimer();
}

function finishActiveBox(notify = false, nextStatus = "review") {
  if (!state.active) return;
  settleElapsed();

  const activeDate = state.active.date || state.date;
  const task = getActiveTask();
  if (task) {
    task.status = nextStatus;
    if (activeDate !== state.date && state.__days?.[activeDate]) {
      state.__days[activeDate] = {
        ...state.__days[activeDate],
        pendingReviewTaskId: nextStatus === "review" ? task.id : null,
      };
    }
    state.pendingReviewTaskId = nextStatus === "review" ? task.id : null;
  }

  state.active = null;
  stopTicker();
  if (notify) notifyBoxEnded(task);
  saveAndRender();
}

function notifyBoxEnded(task) {
  if (!task) return;
  [0, 750, 1500, 2250].forEach((delay) => {
    window.setTimeout(playTimerEndSound, delay);
  });
  navigator.vibrate?.([220, 90, 220, 90, 320]);

  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const notification = new Notification("Timebox ended", {
    body: `How should “${task.name}” end?`,
    icon: "./new%20logo.svg",
    requireInteraction: true,
  });
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}

function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function playTimerEndSound() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return;

  const audioContext = new AudioContextConstructor();
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.22, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.82);
  gain.connect(audioContext.destination);

  [660, 880, 1040].forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    oscillator.type = "sine";
    const startTime = audioContext.currentTime + index * 0.18;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    oscillator.connect(gain);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.3);
  });

  window.setTimeout(() => audioContext.close(), 1000);
}

function render() {
  renderDateHeader();
  renderTagOptions();
  renderSummary();
  renderTasks();
  renderFocusTabs();
  renderTimeboxes();
  renderTimer();
  renderCompletion();
  renderReport();
}

function renderDateHeader() {
  const selectedDate = getDateFromKey(state.date);
  elements.monthYearLabel.textContent = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    year: "numeric",
  })
    .format(selectedDate)
    .replace("/", ", ");
  const completedTimeboxes = state.tasks.filter((task) => task.status === "done" && isTimeboxedTask(task)).length;
  const focusedMinutes = Math.round(state.tasks.reduce((sum, task) => sum + Number(task.actualSeconds || 0), 0) / 60);
  elements.monthProgressLabel.textContent = `${completedTimeboxes} completed timeboxes · ${formatMinutes(focusedMinutes)} focused`;

  elements.selectedDateLabel.textContent = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(selectedDate);
  const viewingToday = isViewingToday();
  elements.selectedDateLabel.classList.toggle("is-today", viewingToday);
  elements.selectedDateLabel.classList.toggle("is-not-today", !viewingToday);
  elements.selectedDateLabel.setAttribute("aria-current", viewingToday ? "date" : "false");

}

function renderSummary() {
  const planned = state.tasks.reduce((sum, task) => sum + task.estimateMinutes, 0);
  const actual = Math.round(state.tasks.reduce((sum, task) => sum + task.actualSeconds, 0) / 60);
  const done = state.tasks.filter((task) => task.status === "done").length;
  const capacityMinutes = state.capacityHours * 60;
  const diff = planned - capacityMinutes;

  elements.capacityText.textContent = formatMinutes(capacityMinutes);
  elements.plannedText.textContent = formatMinutes(planned);
  elements.doneText.textContent = `${done} / ${state.tasks.length}`;
  elements.actualText.textContent = `${formatMinutes(actual)} actual`;

  if (state.tasks.length === 0) {
    elements.overloadText.textContent = "Add this day’s plan";
  } else if (diff > 0) {
    elements.overloadText.textContent = `${formatMinutes(diff)} over capacity`;
  } else {
    elements.overloadText.textContent = `${formatMinutes(Math.abs(diff))} available`;
  }
}

function renderTasks() {
  elements.taskList.innerHTML = "";

  if (state.tasks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Add tasks to plan your day.";
    elements.taskList.append(empty);
    return;
  }

  const sortedTasks = getOrderedTasks();

  sortedTasks.forEach((task) => {
    const node = elements.taskTemplate.content.firstElementChild.cloneNode(true);
    node.classList.toggle("is-done", task.status === "done");
    node.classList.toggle("is-active", task.status === "active");
    node.classList.toggle("is-selected", selectedTaskId === task.id);
    node.tabIndex = 0;
    node.dataset.taskId = task.id;
    node.setAttribute("aria-selected", String(selectedTaskId === task.id));
    node.querySelector("strong").textContent = task.name;
    renderTaskTag(node.querySelector(".task-tag"), task);
    node.querySelector(".task-estimate").textContent = formatMinutes(task.estimateMinutes);
    const note = String(task.note || "").trim();
    const noteIcon = node.querySelector(".task-note-icon");
    noteIcon.hidden = !note;
    noteIcon.title = note;
    node.classList.toggle("has-note", Boolean(note));
    const checkbox = node.querySelector(".task-check");
    checkbox.checked = task.status === "done";
    checkbox.disabled = task.status === "active";
    checkbox.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    checkbox.addEventListener("change", () => {
      if (task.status === "active") return;
      task.status = checkbox.checked ? "done" : "pending";
      if (state.pendingReviewTaskId === task.id) state.pendingReviewTaskId = null;
      saveAndRender();
    });
    const startButton = node.querySelector(".start");
    startButton.disabled = task.status === "done" || Boolean(state.active);
    startButton.addEventListener("click", (event) => {
      event.stopPropagation();
      startTask(task.id);
    });
    node.addEventListener("focus", () => selectTask(task.id));

    node.querySelector(".delete").addEventListener("click", (event) => {
      event.stopPropagation();
      deleteTask(task.id);
    });

    elements.taskList.append(node);
  });
}

function selectTask(id) {
  selectedTaskId = id;
  elements.taskList.querySelectorAll(".task-item").forEach((item) => {
    const isSelected = item.dataset.taskId === id;
    item.classList.toggle("is-selected", isSelected);
    item.setAttribute("aria-selected", String(isSelected));
  });
}

function clearSelectedTask() {
  selectedTaskId = null;
  elements.taskList.querySelectorAll(".task-item").forEach((item) => {
    item.classList.remove("is-selected");
    item.setAttribute("aria-selected", "false");
  });
}

function deleteTask(id) {
  if (state.active?.taskId === id) {
    state.active = null;
    stopTicker();
  }
  state.tasks = state.tasks.filter((item) => item.id !== id);
  if (state.pendingReviewTaskId === id) state.pendingReviewTaskId = null;
  if (selectedTaskId === id) selectedTaskId = null;
  saveAndRender();
}

function deleteTimeboxRecord(id) {
  const task = getTask(id);
  if (!task) return;

  if (state.active?.taskId === id) {
    state.active = null;
    stopTicker();
  }

  delete task.timeboxStartAt;
  delete task.timeboxStartMinute;
  delete task.timeboxDurationMinutes;
  delete task.timeboxOrder;
  task.actualSeconds = 0;
  if (!["done", "pending"].includes(task.status)) task.status = "pending";
  if (state.pendingReviewTaskId === id) state.pendingReviewTaskId = null;
  if (selectedTimeboxTaskId === id) selectedTimeboxTaskId = null;
  saveAndRender();
}

function openTaskModal(id) {
  const task = getTask(id);
  if (!task) return;

  editingTaskId = id;
  clearSelectedTask();
  elements.taskEditDate.textContent = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(getDateFromKey(state.date));
  elements.taskEditName.value = task.name;
  elements.taskEditTag.value = getTaskTag(task);
  elements.taskEditMinutes.value = String(task.estimateMinutes);
  elements.taskEditNote.value = task.note || "";
  elements.taskDeleteButton.disabled = false;
  taskEditInitialValue = getTaskEditFormValue();
  updateTaskSaveButton();
  elements.taskModal.classList.remove("is-hidden");
  elements.taskEditName.focus();
  elements.taskEditName.select();
}

function closeTaskModal() {
  editingTaskId = null;
  taskEditInitialValue = null;
  elements.taskModal.classList.add("is-hidden");
}

function getTaskEditFormValue() {
  return {
    name: elements.taskEditName.value.trim(),
    tag: elements.taskEditTag.value.trim(),
    estimateMinutes: Number(elements.taskEditMinutes.value),
    note: elements.taskEditNote.value.trim(),
  };
}

function updateTaskSaveButton() {
  if (!taskEditInitialValue) {
    elements.taskSaveButton.disabled = true;
    return;
  }

  const currentValue = getTaskEditFormValue();
  const hasChanges = Object.keys(taskEditInitialValue).some((key) => taskEditInitialValue[key] !== currentValue[key]);
  elements.taskSaveButton.disabled = !hasChanges || !currentValue.name;
}

function saveTaskEdit() {
  const task = getTask(editingTaskId);
  if (!task) return;

  const name = elements.taskEditName.value.trim();
  if (!name) return;

  const estimateMinutes = Number(elements.taskEditMinutes.value);
  task.name = name;
  const tag = normalizeTag(elements.taskEditTag.value);
  task.tag = tag;
  task.estimateMinutes = estimateMinutes;
  task.note = elements.taskEditNote.value.trim();

  closeTaskModal();
  saveAndRender();
}

function renderTimer() {
  const active = state.active;
  const task = active ? getActiveTask() : null;

  elements.pauseResumeButton.disabled = !active;
  elements.stopButton.disabled = !active;
  elements.pauseResumeButton.textContent = active?.isPaused ? "Resume" : "Pause";
  elements.timerCard.classList.toggle("is-full-view", isTimerFullView);
  elements.timerFullViewButton.textContent = isTimerFullView ? "Exit full view" : "Full view";
  elements.timerFullViewButton.setAttribute("aria-pressed", String(isTimerFullView));

  if (!active || !task) {
    elements.timerState.textContent = state.pendingReviewTaskId ? "Needs review" : "";
    elements.activeTaskName.textContent = state.pendingReviewTaskId
      ? "Review the timebox that just ended"
      : "Select a task to start";
    elements.timerText.textContent = "00:00";
    updateDocumentTitle();
    setRingProgress(0);
    return;
  }

  const progress = 1 - active.remainingSeconds / active.totalSeconds;
  elements.timerState.textContent = active.isPaused ? "Paused" : "Running";
  elements.activeTaskName.textContent = task.name;
  elements.timerText.textContent = formatClock(active.remainingSeconds);
  updateDocumentTitle(active, task);
  setRingProgress(progress);
}

function setTimerFullView(enabled) {
  isTimerFullView = Boolean(enabled);
  document.body.classList.toggle("is-timer-full-view", isTimerFullView);
  elements.timerCard.classList.toggle("is-full-view", isTimerFullView);
  elements.timerFullViewButton.textContent = isTimerFullView ? "Exit full view" : "Full view";
  elements.timerFullViewButton.setAttribute("aria-pressed", String(isTimerFullView));
}

function updateDocumentTitle(active, task) {
  if (!active || !task) {
    document.title = BASE_TITLE;
    return;
  }

  const status = active.isPaused ? "Paused" : formatClock(active.remainingSeconds);
  document.title = `${status} - ${task.name} · Timo`;
}

function getStartCandidateTask() {
  const selectedTask = selectedTaskId ? getTask(selectedTaskId) : null;
  if (selectedTask && !["done", "active"].includes(selectedTask.status)) return selectedTask;
  return getOrderedTasks().find((task) => !["done", "active"].includes(task.status));
}

function renderFocusTabs() {
  const activeView = state.activeView || "timebox";
  elements.tabButtons.forEach((button) => {
    const isActive = button.dataset.view === activeView;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
  elements.timeboxPanel.classList.toggle("is-hidden", activeView !== "timebox");
  elements.timerCard.classList.toggle("is-hidden", activeView !== "timer");
}

function renderTimeboxes() {
  elements.timeAxis.innerHTML = "";
  elements.timeboxTrack.innerHTML = "";
  const tasks = getTimeboxedTasks();
  if (selectedTimeboxTaskId && !tasks.some((task) => task.id === selectedTimeboxTaskId)) {
    selectedTimeboxTaskId = null;
  }

  if (tasks.length === 0) {
    elements.timeboxMeta.textContent = "Start a task to create a timebox";
    const timelineStart = TIMELINE_START_MINUTE;
    const trackMinutes = TIMELINE_END_MINUTE - TIMELINE_START_MINUTE;
    const timelineHeight = Math.round(trackMinutes * PIXELS_PER_MINUTE);
    const trackHeight = timelineHeight + TIMELINE_BOTTOM_PADDING;
    elements.timeboxTrack.style.height = `${trackHeight}px`;
    elements.timeAxis.style.height = `${trackHeight}px`;
    renderHourMarkers(timelineHeight, timelineStart, trackMinutes / 60);
    renderCurrentTimeLine(timelineStart, timelineHeight);
    return;
  }

  const totalMinutes = tasks.reduce((sum, task) => sum + getTaskActualMinutes(task), 0);
  const timelineStart = Math.min(TIMELINE_START_MINUTE, getTimelineStartMinute(tasks));
  const timelineEnd = Math.max(TIMELINE_END_MINUTE, getTimelineEndMinute(tasks));
  const trackMinutes = timelineEnd - timelineStart;
  const timelineHeight = Math.round(trackMinutes * PIXELS_PER_MINUTE);
  const trackHeight = timelineHeight + TIMELINE_BOTTOM_PADDING;

  elements.timeboxTrack.style.height = `${trackHeight}px`;
  elements.timeAxis.style.height = `${trackHeight}px`;
  elements.timeboxMeta.textContent = `${formatTimeOfDay(timelineStart)} - ${formatTimeOfDay(timelineEnd)} · ${formatMinutes(totalMinutes)} recorded`;
  renderHourMarkers(timelineHeight, timelineStart, trackMinutes / 60);
  renderCurrentTimeLine(timelineStart, timelineHeight);

  for (const task of tasks) {
    const startMinute = getTaskStartMinute(task);
    const durationMinutes = getTaskActualMinutes(task);
    const visibleDurationMinutes = Math.max(durationMinutes, task.status === "active" ? 1 / 60 : 0);
    const endMinute = startMinute + visibleDurationMinutes;
    if (endMinute <= timelineStart || startMinute >= timelineEnd) continue;

    const visibleStartMinute = Math.max(startMinute, timelineStart);
    const visibleEndMinute = Math.min(endMinute, timelineEnd);
    const offsetMinutes = visibleStartMinute - timelineStart;
    const block = document.createElement("button");
    const isShortTimebox = visibleDurationMinutes <= 10;
    const minimumHeight = task.status === "active" ? 8 : isShortTimebox ? 28 : 6;
    const height = Math.max((visibleEndMinute - visibleStartMinute) * PIXELS_PER_MINUTE, minimumHeight);
    const tag = getTaskTag(task);
    block.className = `timebox-block ${task.priority} ${task.status}`;
    block.type = "button";
    block.dataset.taskId = task.id;
    block.draggable = task.status !== "active";
    block.classList.toggle("is-drag-locked", task.status === "active");
    block.classList.toggle("is-selected", selectedTimeboxTaskId === task.id);
    block.classList.toggle("has-tag", Boolean(tag));
    if (tag) block.style.setProperty("--timebox-color", getTagColor(tag));
    block.style.top = `${TIMELINE_TOP_PADDING + offsetMinutes * PIXELS_PER_MINUTE}px`;
    block.style.height = `${height}px`;
    block.setAttribute("aria-disabled", String(task.status === "done" || Boolean(state.active)));
    block.classList.toggle("is-compact", height < 48);
    block.classList.toggle("is-short", isShortTimebox);
    block.classList.toggle("is-tiny", height <= 30);
    block.innerHTML = `
      <strong>${escapeHtml(task.name)}</strong>
      <span>${formatTimeboxActualDuration(task)}</span>
    `;
    block.addEventListener("click", () => {
      if (didDragTimebox) {
        didDragTimebox = false;
        return;
      }
      selectTimebox(task.id);
    });
    block.addEventListener("pointerdown", (event) => {
      startTimeboxPointerDrag(event, task.id, block);
    });
    block.addEventListener("dragstart", (event) => {
      if (state.active?.taskId === task.id) {
        event.preventDefault();
        return;
      }
      draggedTaskId = task.id;
      didDragTimebox = true;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", task.id);
      window.requestAnimationFrame(() => block.classList.add("is-dragging"));
    });
    block.addEventListener("dragend", () => {
      draggedTaskId = null;
      window.setTimeout(() => {
        didDragTimebox = false;
      }, 0);
      block.classList.remove("is-dragging", "drop-before", "drop-after");
    });
    block.addEventListener("dragover", (event) => {
      if (!draggedTaskId || draggedTaskId === task.id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const insertAfter = isPointerAfterBlock(event, block);
      block.classList.toggle("drop-before", !insertAfter);
      block.classList.toggle("drop-after", insertAfter);
    });
    block.addEventListener("dragleave", () => {
      block.classList.remove("drop-before", "drop-after");
    });
    block.addEventListener("drop", (event) => {
      if (!draggedTaskId || draggedTaskId === task.id) return;
      event.preventDefault();
      const insertAfter = isPointerAfterBlock(event, block);
      reorderTimebox(draggedTaskId, task.id, insertAfter ? "after" : "before");
    });
    elements.timeboxTrack.append(block);

  }
}

function selectTimebox(id) {
  selectedTimeboxTaskId = id;
  elements.timeboxTrack.querySelectorAll(".timebox-block").forEach((block) => {
    block.classList.toggle("is-selected", block.dataset.taskId === id);
  });
}

function renderHourMarkers(trackHeight, startMinute, hourCount) {
  for (let index = 0; index <= hourCount * 2; index += 1) {
    const isHour = index % 2 === 0;
    const top = Math.min(TIMELINE_TOP_PADDING + index * 30 * PIXELS_PER_MINUTE, trackHeight);

    if (isHour) {
      const label = document.createElement("div");
      label.className = "time-label";
      label.style.top = `${top}px`;
      label.textContent = formatHourLabel(Math.floor(startMinute / 60) + index / 2);
      elements.timeAxis.append(label);
    }

    const line = document.createElement("div");
    line.className = `time-grid-line ${isHour ? "is-hour" : "is-half"}`;
    line.style.top = `${top}px`;
    elements.timeboxTrack.append(line);
  }
}

function renderCurrentTimeLine(timelineStart, trackHeight) {
  if (!isViewingToday()) return;

  const currentMinute = getMinutesFromDate(Date.now());
  const offsetMinutes = currentMinute - timelineStart;
  if (offsetMinutes < 0) return;

  const top = TIMELINE_TOP_PADDING + offsetMinutes * PIXELS_PER_MINUTE;
  if (top > trackHeight) return;

  const marker = document.createElement("div");
  marker.className = "timebox-now";
  marker.style.top = `${top}px`;
  elements.timeboxTrack.append(marker);
}

function getOrderedTasks() {
  ensureTaskOrder();
  return [...state.tasks].sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (a.status !== "done" && b.status === "done") return -1;
    return a.order - b.order;
  });
}

function getTimeboxedTasks() {
  ensureTimeboxOrder();
  return state.tasks.filter(isTimeboxedTask).sort((a, b) => {
    return getTaskStartMinute(a) - getTaskStartMinute(b) || a.timeboxOrder - b.timeboxOrder;
  });
}

function isTimeboxedTask(task) {
  return Number.isFinite(task.timeboxStartAt) || Number.isFinite(task.timeboxStartMinute);
}

function ensureTaskOrder() {
  state.tasks.forEach((task, index) => {
    if (!Number.isFinite(task.order)) task.order = index;
  });
}

function getNextTaskOrder() {
  ensureTaskOrder();
  if (state.tasks.length === 0) return 0;
  return Math.max(...state.tasks.map((task) => task.order)) + 1;
}

function ensureTimeboxOrder() {
  let nextOrder = 0;
  for (const task of state.tasks) {
    if (Number.isFinite(task.timeboxOrder)) nextOrder = Math.max(nextOrder, task.timeboxOrder + 1);
  }

  for (const task of state.tasks) {
    if (isTimeboxedTask(task) && !Number.isFinite(task.timeboxOrder)) {
      task.timeboxOrder = nextOrder;
      nextOrder += 1;
    }
  }
}

function getNextTimeboxOrder() {
  ensureTimeboxOrder();
  const timeboxedTasks = state.tasks.filter(isTimeboxedTask);
  if (timeboxedTasks.length === 0) return 0;
  return Math.max(...timeboxedTasks.map((task) => task.timeboxOrder)) + 1;
}

function getTaskStartMinute(task) {
  if (Number.isFinite(task.timeboxStartMinute)) return task.timeboxStartMinute;
  if (Number.isFinite(task.timeboxStartAt)) return getMinutesFromDate(task.timeboxStartAt);
  return getMinutesFromDate(Date.now());
}

function getTaskActualMinutes(task) {
  return Math.max(0, Number(task.actualSeconds || 0) / 60);
}

function formatTimeboxActualDuration(task) {
  return formatElapsedDuration(Number(task.actualSeconds || 0));
}

function getTimelineStartMinute(tasks) {
  const earliest = Math.min(...tasks.map(getTaskStartMinute));
  return Math.floor(earliest / 60) * 60;
}

function getTimelineEndMinute(tasks) {
  const latest = Math.max(...tasks.map((task) => getTaskStartMinute(task) + Math.max(getTaskActualMinutes(task), 1)));
  return Math.ceil(latest / 60) * 60;
}

function getMinutesFromDate(value) {
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes();
}

function isPointerAfterBlock(event, block) {
  const rect = block.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2;
}

function startTimeboxPointerDrag(event, taskId, block) {
  if (event.button !== 0 || state.active?.taskId === taskId) return;
  pointerDrag = {
    taskId,
    block,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    targetId: null,
    placement: "after",
    isDragging: false,
  };
  block.setPointerCapture?.(event.pointerId);
  window.addEventListener("pointermove", handleTimeboxPointerMove);
  window.addEventListener("pointerup", handleTimeboxPointerUp, { once: true });
  window.addEventListener("pointercancel", cancelTimeboxPointerDrag, { once: true });
}

function handleTimeboxPointerMove(event) {
  if (!pointerDrag) return;

  const distance = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY);
  if (!pointerDrag.isDragging && distance < 6) return;

  event.preventDefault();
  pointerDrag.isDragging = true;
  didDragTimebox = true;
  pointerDrag.block.classList.add("is-dragging");
  pointerDrag.block.style.transform = `translateY(${event.clientY - pointerDrag.startY}px) scale(0.995)`;
  updateTimeboxDropTarget(event.clientY);
}

function handleTimeboxPointerUp(event) {
  if (!pointerDrag) return;

  const drag = pointerDrag;
  drag.block.releasePointerCapture?.(drag.pointerId);
  drag.block.style.transform = "";
  drag.block.classList.remove("is-dragging");
  clearTimeboxDropMarkers();
  window.removeEventListener("pointermove", handleTimeboxPointerMove);
  window.removeEventListener("pointercancel", cancelTimeboxPointerDrag);
  pointerDrag = null;

  if (drag.isDragging && drag.targetId && drag.targetId !== drag.taskId) {
    reorderTimebox(drag.taskId, drag.targetId, drag.placement);
    return;
  }

  window.setTimeout(() => {
    didDragTimebox = false;
  }, 0);
}

function cancelTimeboxPointerDrag() {
  if (!pointerDrag) return;
  pointerDrag.block.style.transform = "";
  pointerDrag.block.classList.remove("is-dragging");
  clearTimeboxDropMarkers();
  window.removeEventListener("pointermove", handleTimeboxPointerMove);
  window.removeEventListener("pointerup", handleTimeboxPointerUp);
  pointerDrag = null;
  window.setTimeout(() => {
    didDragTimebox = false;
  }, 0);
}

function updateTimeboxDropTarget(clientY) {
  if (!pointerDrag) return;
  clearTimeboxDropMarkers();

  const blocks = [...elements.timeboxTrack.querySelectorAll(".timebox-block")].filter(
    (block) => block.dataset.taskId !== pointerDrag.taskId,
  );
  if (blocks.length === 0) return;

  let targetBlock = blocks[0];
  let smallestDistance = Number.POSITIVE_INFINITY;
  for (const block of blocks) {
    const rect = block.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    const distance = Math.abs(clientY - center);
    if (distance < smallestDistance) {
      smallestDistance = distance;
      targetBlock = block;
    }
  }

  const rect = targetBlock.getBoundingClientRect();
  pointerDrag.targetId = targetBlock.dataset.taskId;
  pointerDrag.placement = clientY > rect.top + rect.height / 2 ? "after" : "before";
  targetBlock.classList.add(pointerDrag.placement === "after" ? "drop-after" : "drop-before");
}

function clearTimeboxDropMarkers() {
  elements.timeboxTrack
    .querySelectorAll(".timebox-block.drop-before, .timebox-block.drop-after")
    .forEach((block) => block.classList.remove("drop-before", "drop-after"));
}

function reorderTimebox(sourceId, targetId, placement) {
  const orderedTasks = getTimeboxedTasks();
  const sourceIndex = orderedTasks.findIndex((task) => task.id === sourceId);
  const targetIndex = orderedTasks.findIndex((task) => task.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;

  const [sourceTask] = orderedTasks.splice(sourceIndex, 1);
  const adjustedTargetIndex = orderedTasks.findIndex((task) => task.id === targetId);
  orderedTasks.splice(placement === "after" ? adjustedTargetIndex + 1 : adjustedTargetIndex, 0, sourceTask);
  orderedTasks.forEach((task, index) => {
    task.timeboxOrder = index;
  });
  draggedTaskId = null;
  saveAndRender();
}

function renderCompletion() {
  const isOpen = Boolean(state.pendingReviewTaskId);
  elements.completionPanel.classList.toggle("is-hidden", !isOpen);

  if (isOpen && !completionPanelWasOpen) {
    elements.completionPanel.querySelector("[data-action='complete']")?.focus({ preventScroll: true });
  }

  completionPanelWasOpen = isOpen;
}

function renderReport() {
  elements.reportPanel.classList.toggle("is-hidden", !state.showReport);

  const planned = state.tasks.reduce((sum, task) => sum + task.estimateMinutes, 0);
  const actual = Math.round(state.tasks.reduce((sum, task) => sum + task.actualSeconds, 0) / 60);
  const done = state.tasks.filter((task) => task.status === "done").length;
  const overruns = state.tasks.filter((task) => Math.round(task.actualSeconds / 60) > task.estimateMinutes).length;

  elements.reportTime.textContent = `${formatMinutes(planned)} / ${formatMinutes(actual)}`;
  elements.reportDone.textContent = state.tasks.length ? `${Math.round((done / state.tasks.length) * 100)}%` : "0%";
  elements.reportOverruns.textContent = `${overruns}`;
  elements.reportBars.innerHTML = "";

  if (state.tasks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No records to review yet.";
    elements.reportBars.append(empty);
    return;
  }

  for (const task of state.tasks) {
    const actualMinutes = Math.round(task.actualSeconds / 60);
    const percent = task.estimateMinutes > 0 ? Math.min((actualMinutes / task.estimateMinutes) * 100, 160) : 0;
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div class="bar-label">
        <span>${escapeHtml(task.name)}</span>
        <span>${formatMinutes(task.estimateMinutes)} planned · ${formatMinutes(actualMinutes)} actual</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill ${actualMinutes > task.estimateMinutes ? "overrun" : ""}" style="width: ${Math.max(percent, 4)}%"></div>
      </div>
    `;
    elements.reportBars.append(row);
  }
}

function setRingProgress(progress) {
  const clamped = Math.max(0, Math.min(progress, 1));
  elements.ringProgress.style.strokeDashoffset = String(RING_LENGTH * (1 - clamped));
}

function formatMinutes(minutes) {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

function formatSeconds(seconds) {
  return formatMinutes(Math.round(seconds / 60));
}

function formatElapsedDuration(seconds) {
  const rounded = Math.max(0, Math.floor(seconds));
  if (rounded < 60) return `${rounded}s`;

  const totalMinutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours && remainingSeconds) return `${minutes}m ${remainingSeconds}s`;
  if (!hours) return `${minutes}m`;
  if (minutes) return `${hours}h ${minutes}m`;
  return `${hours}h`;
}

function formatClock(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatTimeOfDay(totalMinutes) {
  const normalized = ((Math.round(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const period = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

function formatHourLabel(hour24) {
  const normalized = hour24 % 24;
  const period = normalized < 12 ? "AM" : "PM";
  const hour12 = normalized % 12 || 12;
  return `${hour12} ${period}`;
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateFromKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDaysToDateKey(dateKey, offsetDays) {
  const date = getDateFromKey(dateKey);
  date.setDate(date.getDate() + offsetDays);
  return getLocalDateKey(date);
}

function isViewingToday() {
  return state.date === getLocalDateKey();
}

function statusLabel(status) {
  return {
    pending: "Pending",
    active: "Running",
    review: "Needs review",
    paused: "Paused",
    done: "Done",
  }[status];
}

function getTaskTag(task) {
  return normalizeTag(task.tag);
}

function normalizeTag(tag) {
  const normalized = String(tag || "").trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  const renamed = LEGACY_TAG_RENAMES.get(normalized.toLowerCase());
  if (renamed) return renamed;
  const defaultTag = DEFAULT_TAGS.find((tagName) => tagName.toLowerCase() === normalized.toLowerCase());
  return defaultTag || "";
}

function normalizeTaskTags(task) {
  const normalizedTask = {
    ...task,
    tag: normalizeTag(task.tag),
  };
  return normalizeDemoTimebox(normalizedTask);
}

function normalizeDemoTimebox(task) {
  if (!String(task.id || "").startsWith("demo-") || task.status === "done") return task;
  const { timeboxStartAt, timeboxStartMinute, timeboxDurationMinutes, timeboxOrder, ...rest } = task;
  return rest;
}

function getAvailableTags() {
  return [...DEFAULT_TAGS];
}

function renderTagOptions() {
  elements.tagOptions.innerHTML = "";
  elements.taskTag.innerHTML = "";
  elements.taskEditTag.innerHTML = "";
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "Tag";
  elements.taskTag.append(emptyOption);

  const editEmptyOption = document.createElement("option");
  editEmptyOption.value = "";
  editEmptyOption.textContent = "No tag";
  elements.taskEditTag.append(editEmptyOption);

  getAvailableTags().forEach((tag) => {
    const dataOption = document.createElement("option");
    dataOption.value = tag;
    elements.tagOptions.append(dataOption);

    const selectOption = document.createElement("option");
    selectOption.value = tag;
    selectOption.textContent = tag;
    elements.taskTag.append(selectOption);

    const editSelectOption = document.createElement("option");
    editSelectOption.value = tag;
    editSelectOption.textContent = tag;
    elements.taskEditTag.append(editSelectOption);
  });
}

function getTaskMetaPrefix(task, escaped = false) {
  const tag = getTaskTag(task);
  if (!tag) return "";
  return `${escaped ? escapeHtml(tag) : tag} · `;
}

function renderTaskTag(element, task) {
  const tag = getTaskTag(task);
  element.textContent = tag;
  element.classList.toggle("is-hidden", !tag);
  if (!tag) {
    element.style.removeProperty("--tag-color");
    element.style.removeProperty("--tag-bg");
    element.style.removeProperty("--tag-border");
    return;
  }

  const color = getTagColor(tag);
  element.style.setProperty("--tag-color", color);
  element.style.setProperty("--tag-bg", `color-mix(in srgb, ${color} 15%, transparent)`);
  element.style.setProperty("--tag-border", `color-mix(in srgb, ${color} 48%, transparent)`);
}

function getTagColor(tag) {
  return TAG_COLORS.get(normalizeTag(tag).toLowerCase()) || "#19d0e8";
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char];
  });
}

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js");
}

if (state.active && !state.active.isPaused) {
  state.active.startedAt = Date.now();
  startTicker();
}

render();
